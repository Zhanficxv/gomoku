package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestServer() *httptest.Server {
	s := New(nil)
	return httptest.NewServer(s.Routes())
}

func decodeBody(t *testing.T, resp *http.Response, into any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func TestCreateAndGetGame(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/games", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var created struct {
		ID    string         `json:"id"`
		State map[string]any `json:"state"`
	}
	decodeBody(t, resp, &created)
	if created.ID == "" {
		t.Fatal("expected non-empty id")
	}

	resp, err = http.Get(ts.URL + "/api/games/" + created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestMoveFlow(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	resp, _ := http.Post(ts.URL+"/api/games", "application/json", nil)
	var created struct {
		ID string `json:"id"`
	}
	decodeBody(t, resp, &created)

	body, _ := json.Marshal(map[string]int{"x": 7, "y": 7})
	resp, err := http.Post(ts.URL+"/api/games/"+created.ID+"/move", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// 同一位置再下应当报错
	resp, _ = http.Post(ts.URL+"/api/games/"+created.ID+"/move", "application/json", bytes.NewReader(body))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for occupied, got %d", resp.StatusCode)
	}
}

func TestUndoAndReset(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	resp, _ := http.Post(ts.URL+"/api/games", "application/json", nil)
	var created struct {
		ID string `json:"id"`
	}
	decodeBody(t, resp, &created)

	body, _ := json.Marshal(map[string]int{"x": 0, "y": 0})
	_, _ = http.Post(ts.URL+"/api/games/"+created.ID+"/move", "application/json", bytes.NewReader(body))

	resp, _ = http.Post(ts.URL+"/api/games/"+created.ID+"/undo", "application/json", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on undo, got %d", resp.StatusCode)
	}

	resp, _ = http.Post(ts.URL+"/api/games/"+created.ID+"/reset", "application/json", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on reset, got %d", resp.StatusCode)
	}
}

func TestGameNotFound(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	resp, _ := http.Get(ts.URL + "/api/games/doesnotexist")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}
