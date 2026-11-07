package main

import (
	"io"
	"sync"
)

// Verify the entire synthetic address so a recycled slot cannot receive stale traffic.
type gameConnection struct {
	ip     [4]byte
	mu     sync.RWMutex
	writer io.Writer
	closed bool
}

func (c *gameConnection) setWriter(w io.Writer) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.writer = w
	}
}
func (c *gameConnection) write(ip [4]byte, packet []byte) {
	c.mu.RLock()
	writer, valid := c.writer, !c.closed && c.ip == ip
	c.mu.RUnlock()
	if valid && writer != nil {
		_, _ = writer.Write(packet)
	}
}
func (c *gameConnection) close() { c.mu.Lock(); defer c.mu.Unlock(); c.closed = true; c.writer = nil }

const gamePacketBufferSize = 8 * 1024

// readGamePackets reuses one input buffer for the life of a WebRTC connection.
// Only the received payload is copied because packets remain queued after
// the next read; retaining the full 8 KiB buffer per packet wastes memory.
func readGamePackets(reader io.Reader, accept func([]byte)) {
	buffer := make([]byte, gamePacketBufferSize)
	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			payload := make([]byte, n)
			copy(payload, buffer[:n])
			accept(payload)
		}
		if err != nil {
			return
		}
	}
}
