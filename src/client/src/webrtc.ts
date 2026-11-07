import { Net, type Packet, Xash3D, type Xash3DOptions } from 'xash3d-fwgs';

export class Xash3DWebRTC extends Xash3D {
  private channel?: RTCDataChannel;
  private resolve?: (value?: unknown) => void;
  private ws?: WebSocket;
  private peer?: RTCPeerConnection;
  private candidates: RTCIceCandidateInit[] = [];
  private wasRemote = false;
  private timeout?: ReturnType<typeof setTimeout>;

  constructor(opts?: Xash3DOptions) {
    super(opts);
    this.net = new Net(this);
  }

  async init() {
    await Promise.all([super.init(), this.connect()]);
  }

  initConnection() {
    if (this.peer) return;

    this.peer = new RTCPeerConnection();
    this.peer.onicecandidate = (e) => {
      if (!e.candidate) {
        return;
      }
      this.wsSend('candidate', e.candidate.toJSON());
    };
    this.peer.ontrack = (e) => {
      const el = document.createElement(e.track.kind) as HTMLAudioElement;
      el.srcObject = e.streams[0];
      el.autoplay = true;
      el.controls = true;
      document.body.appendChild(el);

      e.track.onmute = () => {
        el.play();
      };

      e.streams[0].onremovetrack = () => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      };
    };
    let channelsCount = 0;
    this.peer.ondatachannel = (e) => {
      if (e.channel.label === 'write') {
        e.channel.onmessage = (ee) => {
          const packet: Packet = {
            ip: [127, 0, 0, 1],
            port: 8080,
            data: ee.data,
          };
          if (ee.data.arrayBuffer) {
            ee.data.arrayBuffer().then((data: Int8Array) => {
              packet.data = data;
              this.net!.incoming.enqueue(packet);
            });
          } else {
            this.net!.incoming.enqueue(packet);
          }
        };
      }
      e.channel.onopen = () => {
        channelsCount += 1;
        if (e.channel.label === 'read') {
          this.channel = e.channel;
        }
        if (channelsCount === 2) {
          if (this.resolve) {
            const r = this.resolve;
            this.resolve = undefined;
            if (this.timeout) {
              clearTimeout(this.timeout);
              this.timeout = undefined;
            }
            r();
          }
        }
      };
    };
  }

  private wsSend(event: string, data: unknown) {
    this.ws?.send(
      JSON.stringify({
        event,
        data,
      })
    );
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        this.ws?.close();
        finish(new Error('WebRTC connection timed out'));
      }, 25000);
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.resolve = undefined;
        if (error) reject(error); else resolve();
      };
      this.resolve = () => finish();

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(protocol + '://' + window.location.host + '/websocket');
      this.ws = ws;
      ws.onopen = () => this.initConnection();
      ws.onerror = () => finish(new Error('Unable to open WebSocket signalling'));
      ws.onclose = () => finish(new Error('WebSocket signalling closed'));
      ws.addEventListener('message', async (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          switch (parsed.event) {
            case 'offer': {
              if (!this.peer) throw new Error('Peer connection missing');
              await this.peer.setRemoteDescription(parsed.data);
              const answer = await this.peer.createAnswer();
              await this.peer.setLocalDescription(answer);
              this.wsSend('answer', answer);
              if (!this.wasRemote) {
                this.wasRemote = true;
                for (const candidate of this.candidates) {
                  await this.peer.addIceCandidate(candidate);
                }
                this.candidates = [];
              }
              break;
            }
            case 'candidate':
              if (this.wasRemote) await this.peer?.addIceCandidate(parsed.data);
              else this.candidates.push(parsed.data);
              break;
          }
        } catch (error) {
          console.error('WebRTC signalling failed:', error);
          finish(new Error('WebRTC signalling error'));
        }
      });
    });
  }

  sendto(packet: Packet) {
    if (!this.channel) return;
    this.channel.send(packet.data);
  }
}
