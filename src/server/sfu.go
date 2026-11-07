package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"github.com/pion/ice/v4"
	"github.com/pion/interceptor"
	"github.com/pion/logging"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	goxash3d_fwgs "github.com/yohimik/goxash3d-fwgs/pkg"
	"io"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

var connections = NewFixedArray[*gameConnection](128)
var packets = make(chan *goxash3d_fwgs.Packet, 256)
var enginePulse atomic.Int64
var (
	upgrader        = websocket.Upgrader{CheckOrigin: sameOrigin, HandshakeTimeout: 10 * time.Second}
	api             *webrtc.API
	listLock        sync.RWMutex
	peerConnections []*peerConnectionState
	trackLocals     map[string]*webrtc.TrackLocalStaticRTP
	log             = logging.NewDefaultLoggerFactory().NewLogger("sfu-ws")
)

type websocketMessage struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}
type peerConnectionState struct {
	peerConnection *webrtc.PeerConnection
	websocket      *threadSafeWriter
	signalsCount   int
}

const DefaultSignalsCount = 5

func addTrack(t *webrtc.TrackRemote) *webrtc.TrackLocalStaticRTP {
	listLock.Lock()
	defer func() { listLock.Unlock(); signalPeerConnections() }()
	track, err := webrtc.NewTrackLocalStaticRTP(t.Codec().RTPCodecCapability, t.ID(), t.StreamID())
	if err != nil {
		log.Errorf("Cannot create media track: %v", err)
		return nil
	}
	trackLocals[t.ID()] = track
	for _, connection := range peerConnections {
		connection.signalsCount = DefaultSignalsCount
	}
	return track
}
func removeTrack(t *webrtc.TrackLocalStaticRTP) {
	listLock.Lock()
	defer func() { listLock.Unlock(); signalPeerConnections() }()
	for _, connection := range peerConnections {
		connection.signalsCount = DefaultSignalsCount
	}
	delete(trackLocals, t.ID())
}
func signalPeerConnections() {
	listLock.Lock()
	defer func() { listLock.Unlock(); dispatchKeyFrame() }()
	attemptSync := func() bool {
		for i := range peerConnections {
			state := peerConnections[i]
			// Cleanup precedes the signaling budget check: exhausted peers still leave.
			if state.peerConnection.ConnectionState() == webrtc.PeerConnectionStateClosed {
				peerConnections = append(peerConnections[:i], peerConnections[i+1:]...)
				return true
			}
			if state.signalsCount <= 0 {
				continue
			}
			if state.peerConnection.SignalingState() != webrtc.SignalingStateStable {
				continue
			}
			senders := map[string]bool{}
			for _, sender := range state.peerConnection.GetSenders() {
				if sender.Track() == nil {
					continue
				}
				senders[sender.Track().ID()] = true
				if _, ok := trackLocals[sender.Track().ID()]; !ok {
					if err := state.peerConnection.RemoveTrack(sender); err != nil {
						return true
					}
				}
			}
			for _, receiver := range state.peerConnection.GetReceivers() {
				if receiver.Track() != nil {
					senders[receiver.Track().ID()] = true
				}
			}
			for id, track := range trackLocals {
				if !senders[id] {
					if _, err := state.peerConnection.AddTrack(track); err != nil {
						return true
					}
				}
			}
			offer, err := state.peerConnection.CreateOffer(nil)
			if err != nil {
				return true
			}
			if err = state.peerConnection.SetLocalDescription(offer); err != nil {
				return true
			}
			if err = state.websocket.WriteJSON("offer", offer); err != nil {
				return true
			}
		}
		return false
	}
	for attempt := 0; attempt < 25; attempt++ {
		if !attemptSync() {
			return
		}
	}
	time.AfterFunc(3*time.Second, signalPeerConnections)
}
func dispatchKeyFrame() {
	listLock.Lock()
	defer listLock.Unlock()
	for _, state := range peerConnections {
		for _, receiver := range state.peerConnection.GetReceivers() {
			if receiver.Track() != nil {
				_ = state.peerConnection.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(receiver.Track().SSRC())}})
			}
		}
	}
}

const messageSize = 8 * 1024

func ReadLoop(reader io.Reader, ip [4]byte) {
	for {
		buffer := make([]byte, messageSize)
		n, err := reader.Read(buffer)
		if err != nil {
			return
		}
		// Unreliable game traffic must not strand a reader when the queue is full.
		select {
		case packets <- &goxash3d_fwgs.Packet{IP: ip, Data: buffer[:n]}:
		default:
		}
	}
}
func websocketHandler(w http.ResponseWriter, r *http.Request) {
	socket, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Errorf("Websocket upgrade: %v", err)
		return
	}
	c := &threadSafeWriter{Conn: socket}
	defer c.Close()
	c.SetReadLimit(64 * 1024)
	_ = c.SetReadDeadline(time.Now().Add(75 * time.Second))
	c.SetPongHandler(func(string) error { return c.SetReadDeadline(time.Now().Add(75 * time.Second)) })
	done := make(chan struct{})
	defer close(done)
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				if err := c.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second)); err != nil {
					_ = c.Close()
					return
				}
			}
		}
	}()
	peer, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		log.Errorf("Peer creation: %v", err)
		return
	}
	defer peer.Close()
	if _, err := peer.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		log.Errorf("Audio transceiver: %v", err)
		return
	}
	unordered := false
	var retries uint16
	options := &webrtc.DataChannelInit{Ordered: &unordered, MaxRetransmits: &retries}
	readChannel, err := peer.CreateDataChannel("read", options)
	if err != nil {
		return
	}
	defer readChannel.Close()
	var ip [4]byte
	if _, err = rand.Read(ip[:]); err != nil {
		return
	}
	index, err := connections.Add(nil)
	if err != nil {
		log.Errorf("Session capacity: %v", err)
		return
	}
	defer connections.Remove(index)
	// Keep synthetic players in reserved LAN space for sv_lan=1.
	ip[0] = 10
	ip[3] = index
	record := &gameConnection{ip: ip}
	connections.Replace(index, record)
	defer record.close()
	readChannel.OnOpen(func() {
		stream, err := readChannel.Detach()
		if err != nil {
			log.Errorf("Detach read: %v", err)
			_ = c.Close()
			return
		}
		go ReadLoop(stream, ip)
	})
	writeChannel, err := peer.CreateDataChannel("write", options)
	if err != nil {
		return
	}
	defer writeChannel.Close()
	writeChannel.OnOpen(func() {
		stream, err := writeChannel.Detach()
		if err != nil {
			log.Errorf("Detach write: %v", err)
			_ = c.Close()
			return
		}
		record.setWriter(stream)
	})
	peer.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			if err := c.WriteJSON("candidate", candidate.ToJSON()); err != nil {
				_ = c.Close()
			}
		}
	})
	peer.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		switch state {
		case webrtc.PeerConnectionStateFailed:
			_ = c.Close()
			_ = peer.Close()
		case webrtc.PeerConnectionStateClosed:
			_ = c.Close()
			signalPeerConnections()
		}
	})
	peer.OnTrack(func(remote *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		local := addTrack(remote)
		if local == nil {
			return
		}
		defer removeTrack(local)
		buffer := make([]byte, 1500)
		packet := &rtp.Packet{}
		for {
			n, _, err := remote.Read(buffer)
			if err != nil {
				return
			}
			if err = packet.Unmarshal(buffer[:n]); err != nil {
				return
			}
			packet.Extension = false
			packet.Extensions = nil
			if err = local.WriteRTP(packet); err != nil {
				return
			}
		}
	})
	state := &peerConnectionState{peer, c, DefaultSignalsCount}
	listLock.Lock()
	peerConnections = append(peerConnections, state)
	listLock.Unlock()
	signalPeerConnections()
	pending := []webrtc.ICECandidateInit{}
	for {
		_, raw, err := c.ReadMessage()
		if err != nil {
			return
		}
		message := websocketMessage{}
		if json.Unmarshal(raw, &message) != nil {
			return
		}
		switch message.Event {
		case "candidate":
			var candidate webrtc.ICECandidateInit
			if json.Unmarshal(message.Data, &candidate) != nil {
				return
			}
			if peer.RemoteDescription() == nil {
				if len(pending) >= 64 {
					return
				}
				pending = append(pending, candidate)
				continue
			}
			if err = peer.AddICECandidate(candidate); err != nil {
				log.Errorf("ICE candidate: %v", err)
				return
			}
		case "answer":
			var answer webrtc.SessionDescription
			if json.Unmarshal(message.Data, &answer) != nil {
				return
			}
			if answer.Type != webrtc.SDPTypeAnswer {
				return
			}
			if err = peer.SetRemoteDescription(answer); err != nil {
				log.Errorf("Remote description: %v", err)
				return
			}
			for _, candidate := range pending {
				if peer.AddICECandidate(candidate) != nil {
					return
				}
			}
			pending = nil
			listLock.Lock()
			state.signalsCount--
			resignal := state.signalsCount > 0
			listLock.Unlock()
			if resignal {
				signalPeerConnections()
			}
		default:
			return
		}
	}
}

type threadSafeWriter struct {
	*websocket.Conn
	sync.Mutex
}

func (c *threadSafeWriter) WriteJSON(event string, value any) error {
	c.Lock()
	defer c.Unlock()
	if err := c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return err
	}
	return c.Conn.WriteJSON(struct {
		Event string `json:"event"`
		Data  any    `json:"data"`
	}{event, value})
}

type Server struct{}

var staticFiles = publicFileHandler("public")

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/websocket":
		websocketHandler(w, r)
	case "/api/server-info":
		serverInfoHandler(w, r)
	case "/healthz":
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"web":"ok"}`)
	case "/readyz":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		pulse := enginePulse.Load()
		ready := pulse > 0 && time.Since(time.Unix(0, pulse)) < 5*time.Second
		if !ready {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"engineResponding": ready})
	default:
		staticFiles.ServeHTTP(w, r)
	}
}
func runSFU() {
	settings := webrtc.SettingEngine{}
	settings.DetachDataChannels()
	mux, err := ice.NewMultiUDPMuxFromPort(gameConfig.Port)
	if err != nil {
		panic(err)
	}
	settings.SetICEUDPMux(mux)
	settings.SetNAT1To1IPs([]string{gameConfig.IP}, webrtc.ICECandidateTypeHost)
	media := &webrtc.MediaEngine{}
	if err := media.RegisterDefaultCodecs(); err != nil {
		panic(err)
	}
	interceptors := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(media, interceptors); err != nil {
		panic(err)
	}
	api = webrtc.NewAPI(webrtc.WithSettingEngine(settings), webrtc.WithMediaEngine(media), webrtc.WithInterceptorRegistry(interceptors))
	trackLocals = map[string]*webrtc.TrackLocalStaticRTP{}
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			dispatchKeyFrame()
		}
	}()
	goxash3d_fwgs.DefaultXash3D.RegisterRecvfromCallback(func() *goxash3d_fwgs.Packet {
		enginePulse.Store(time.Now().UnixNano())
		select {
		case packet := <-packets:
			return packet
		default:
		}
		timer := time.NewTimer(10 * time.Millisecond)
		defer timer.Stop()
		select {
		case packet := <-packets:
			return packet
		case <-timer.C:
			return nil
		}
	})
	goxash3d_fwgs.DefaultXash3D.RegisterSendtoCallback(func(packet goxash3d_fwgs.Packet) {
		connection, err := connections.Get(packet.IP[3])
		if err == nil && connection != nil {
			connection.write(packet.IP, packet.Data)
		}
	})
	// Return after callbacks are installed; main can then safely enter the engine.
	server := &http.Server{Addr: envValue("HTTP_ADDR", ":27016"), Handler: &Server{}, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 75 * time.Second, MaxHeaderBytes: 64 * 1024}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Errorf("HTTP listener: %v", err)
			os.Exit(1)
		}
	}()
}
