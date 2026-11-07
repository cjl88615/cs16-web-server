import { Net, type Packet, Xash3D, type Xash3DOptions } from 'xash3d-fwgs';
import { zh } from './zh';
export class Xash3DWebRTC extends Xash3D {
  private channel?: RTCDataChannel;
  private ws?: WebSocket;
  private peer?: RTCPeerConnection;
  private candidates: RTCIceCandidateInit[] = [];
  private resolve?: () => void;
  private reject?: (error: Error) => void;
  private timeout?: ReturnType<typeof setTimeout>;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private stopped = false;
  private media = new Set<HTMLMediaElement>();
  constructor(opts?: Xash3DOptions) { super(opts); this.net = new Net(this); }
  // Do not occupy a game connection while downloading or initializing WASM.
  async init() { await super.init(); }
  connect(): Promise<void> {
    if (this.ws || this.peer) return Promise.reject(new Error(zh.network));
    this.stopped = false; this.ready = false;
    return new Promise<void>((resolve, reject) => {
      this.resolve = resolve; this.reject = reject;
      this.timeout = setTimeout(() => this.fail(new Error(zh.timeout)), 25000);
      const peer = this.peer = new RTCPeerConnection({ iceServers: [] });
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = this.ws = new WebSocket(`${protocol}//${location.host}/websocket`);
      let incomingOpen = false; let outgoingOpen = false;
      const opened = () => {
        if (incomingOpen && outgoingOpen && !this.stopped) {
          this.ready = true; clearTimeout(this.timeout); this.timeout = undefined;
          const done = this.resolve; this.resolve = undefined; this.reject = undefined; done?.();
        }
      };
      peer.onicecandidate = event => { if (event.candidate) this.wsSend('candidate', event.candidate.toJSON()); };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') clearTimeout(this.disconnectTimer);
        if (peer.connectionState === 'failed') this.fail(new Error(zh.disconnected));
        if (peer.connectionState === 'disconnected') {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = setTimeout(() => this.fail(new Error(zh.disconnected)), 8000);
        }
      };
      peer.ontrack = event => {
        const el = document.createElement('audio'); el.autoplay = true;
        el.srcObject = event.streams[0] || new MediaStream([event.track]);
        this.media.add(el); document.body.appendChild(el);
        event.track.onended = () => { el.remove(); this.media.delete(el); };
        void el.play().catch(() => {});
      };
      peer.ondatachannel = ({ channel }) => {
        channel.binaryType = 'arraybuffer';
        if (channel.label === 'write') {
          channel.onmessage = event => {
            if (this.stopped || !(event.data instanceof ArrayBuffer)) return;
            const packet: Packet = { ip: [127, 0, 0, 1], port: 8080, data: new Int8Array(event.data) };
            this.net!.incoming.enqueue(packet);
          };
          channel.onopen = () => { incomingOpen = true; opened(); };
        } else if (channel.label === 'read') {
          this.channel = channel;
          channel.onopen = () => { outgoingOpen = true; opened(); };
        } else { channel.close(); return; }
        channel.onclose = () => { if (!this.stopped) this.fail(new Error(zh.disconnected)); };
        channel.onerror = () => this.fail(new Error(zh.disconnected));
      };
      // Serialize asynchronous signaling so ICE cannot race an SDP offer.
      let processing = Promise.resolve();
      ws.onmessage = event => {
        processing = processing.then(async () => {
          if (this.stopped) return;
          const message = JSON.parse(event.data);
          if (message.event === 'offer') {
            await peer.setRemoteDescription(message.data);
            await peer.setLocalDescription(await peer.createAnswer());
            this.wsSend('answer', peer.localDescription);
            for (const candidate of this.candidates.splice(0)) await peer.addIceCandidate(candidate);
          } else if (message.event === 'candidate') {
            if (peer.remoteDescription) await peer.addIceCandidate(message.data);
            else this.candidates.push(message.data);
          }
        }).catch(() => this.fail(new Error(zh.disconnected)));
      };
      ws.onerror = () => this.fail(new Error(zh.disconnected));
      ws.onclose = () => { if (!this.stopped) this.fail(new Error(zh.disconnected)); };
    });
  }
  private wsSend(event: string, data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event, data }));
  }
  private fail(error: Error) {
    if (this.stopped) return;
    const wasReady = this.ready; const reject = this.reject; this.disconnect(); reject?.(error);
    if (wasReady) window.dispatchEvent(new Event('cs16-disconnected'));
  }
  disconnect() {
    this.stopped = true; clearTimeout(this.timeout); clearTimeout(this.disconnectTimer);
    this.resolve = undefined; this.reject = undefined;
    this.ws?.close(); this.peer?.close(); this.ws = undefined; this.peer = undefined;
    this.channel = undefined; this.candidates = [];
    for (const el of this.media) { el.pause(); el.srcObject = null; el.remove(); }
    this.media.clear();
  }
  sendto(packet: Packet) {
    if (this.channel?.readyState !== 'open' || this.channel.bufferedAmount > 256 * 1024) return;
    try { this.channel.send(new Int8Array(packet.data)); }
    catch { this.fail(new Error(zh.disconnected)); }
  }
}
