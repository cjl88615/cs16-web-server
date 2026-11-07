package main

import (
	"bytes"
	"io"
	"sync"
	"sync/atomic"
	"testing"
)

func TestSessionIdentityAndClose(t *testing.T) {
	var output bytes.Buffer
	connection := &gameConnection{ip: [4]byte{10, 2, 3, 7}}
	connection.setWriter(&output)
	connection.write([4]byte{10, 9, 9, 7}, []byte("stale"))
	if output.Len() != 0 {
		t.Fatal("stale session packet accepted")
	}
	connection.write(connection.ip, []byte("valid"))
	if output.String() != "valid" {
		t.Fatal(output.String())
	}
	connection.close()
	connection.setWriter(&output)
	connection.write(connection.ip, []byte("closed"))
	if output.String() != "valid" {
		t.Fatal("closed session reopened")
	}
}

type packetSequenceReader struct {
	chunks [][]byte
	offset int
}

func (r *packetSequenceReader) Read(buffer []byte) (int, error) {
	if r.offset == len(r.chunks) {
		return 0, io.EOF
	}
	n := copy(buffer, r.chunks[r.offset])
	r.offset++
	return n, nil
}

func TestPacketReadsUseExactPayloadAndDoNotCorruptEarlierPackets(t *testing.T) {
	reader := &packetSequenceReader{chunks: [][]byte{[]byte("first"), []byte("a"), []byte("third-packet")}}
	var packets [][]byte
	readGamePackets(reader, func(payload []byte) {
		packets = append(packets, payload)
	})
	want := []string{"first", "a", "third-packet"}
	if len(packets) != len(want) {
		t.Fatalf("got %d packets, want %d", len(packets), len(want))
	}
	for i, packet := range packets {
		if string(packet) != want[i] || cap(packet) != len(want[i]) {
			t.Errorf("packet %d: %q len=%d cap=%d", i, packet, len(packet), cap(packet))
		}
	}
}

func TestPacketReaderPreservesDataWhenReadAlsoReturnsEOF(t *testing.T) {
	reader := &dataAndEOFReader{}
	var got []byte
	readGamePackets(reader, func(packet []byte) { got = packet })
	if string(got) != "last" {
		t.Fatalf("lost final payload: %q", got)
	}
}

type dataAndEOFReader struct{ read bool }

func (r *dataAndEOFReader) Read(buffer []byte) (int, error) {
	if r.read {
		return 0, io.EOF
	}
	r.read = true
	return copy(buffer, "last"), io.EOF
}

func TestSessionLimiterRejectsExtraPeersAndReleasesCapacity(t *testing.T) {
	const maxPlayers = 8
	var limiter sessionLimiter
	const attempts = 80
	var accepted atomic.Int32
	var evaluated sync.WaitGroup
	var finished sync.WaitGroup
	release := make(chan struct{})
	start := make(chan struct{})
	evaluated.Add(attempts)
	finished.Add(attempts)
	for i := 0; i < attempts; i++ {
		go func() {
			defer finished.Done()
			<-start
			ok := limiter.acquire(maxPlayers)
			if ok {
				accepted.Add(1)
			}
			evaluated.Done()
			if ok {
				<-release
				limiter.release()
			}
		}()
	}
	close(start)
	evaluated.Wait()
	if got := accepted.Load(); got != maxPlayers {
		t.Errorf("accepted %d concurrent sessions, want %d", got, maxPlayers)
	}
	close(release)
	finished.Wait()
	if got := limiter.active.Load(); got != 0 {
		t.Fatalf("capacity leaked: %d sessions active", got)
	}
	if !limiter.acquire(maxPlayers) {
		t.Fatal("session capacity not restored after disconnect")
	}
	limiter.release()
}
