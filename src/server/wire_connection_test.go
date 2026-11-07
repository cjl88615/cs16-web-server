package main

import (
	"bytes"
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
