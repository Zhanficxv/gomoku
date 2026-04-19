package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"

	"github.com/cursor/gomoku/internal/arcade"
)

func newTestServer() *httptest.Server {
	s := New(nil, arcade.RegisteredGames())
	return httptest.NewServer(s.Routes())
}

func newTestClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}
	return &http.Client{Jar: jar}
}

func decodeBody(t *testing.T, resp *http.Response, into any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func postJSON(t *testing.T, client *http.Client, url string, body any) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		buf, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(buf)
	}
	resp, err := client.Post(url, "application/json", reader)
	if err != nil {
		t.Fatalf("post %s: %v", url, err)
	}
	return resp
}

func registerUser(t *testing.T, client *http.Client, baseURL, name, username, password string) publicUser {
	t.Helper()
	resp := postJSON(t, client, baseURL+"/api/auth/register", map[string]string{
		"name":     name,
		"username": username,
		"password": password,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 on register, got %d", resp.StatusCode)
	}
	var payload struct {
		User publicUser `json:"user"`
	}
	decodeBody(t, resp, &payload)
	return payload.User
}

func createGame(t *testing.T, client *http.Client, baseURL string) string {
	t.Helper()
	resp := postJSON(t, client, baseURL+"/api/games", nil)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 on create game, got %d", resp.StatusCode)
	}
	var payload struct {
		ID string `json:"id"`
	}
	decodeBody(t, resp, &payload)
	if payload.ID == "" {
		t.Fatal("expected non-empty game id")
	}
	return payload.ID
}

func TestRegisterLoginAndLogout(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	client := newTestClient(t)
	u := registerUser(t, client, ts.URL, "测试用户", "tester_01", "secret123")
	if u.Username != "tester_01" {
		t.Fatalf("expected normalized username, got %q", u.Username)
	}

	resp, err := client.Get(ts.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on me, got %d", resp.StatusCode)
	}

	resp = postJSON(t, client, ts.URL+"/api/auth/logout", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on logout, got %d", resp.StatusCode)
	}

	resp, err = client.Get(ts.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 after logout, got %d", resp.StatusCode)
	}
}

func TestArcadeGamesList(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/arcade/games")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on arcade games, got %d", resp.StatusCode)
	}

	var payload struct {
		Games []arcade.Game `json:"games"`
	}
	decodeBody(t, resp, &payload)
	if len(payload.Games) < 6 {
		t.Fatalf("expected at least 6 games, got %d", len(payload.Games))
	}
	if payload.Games[0].Slug == "" || payload.Games[0].Route == "" {
		t.Fatal("expected game entries to contain slug and route")
	}
}

func TestGameRequiresLogin(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/games", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestCreateAndGetGame(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	client := newTestClient(t)
	registerUser(t, client, ts.URL, "Alice", "alice_01", "secret123")
	gameID := createGame(t, client, ts.URL)

	resp, err := client.Get(ts.URL + "/api/games/" + gameID)
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

	client := newTestClient(t)
	registerUser(t, client, ts.URL, "Alice", "alice_02", "secret123")
	gameID := createGame(t, client, ts.URL)

	resp := postJSON(t, client, ts.URL+"/api/games/"+gameID+"/move", map[string]int{"x": 7, "y": 7})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// 同一位置再下应当报错
	resp = postJSON(t, client, ts.URL+"/api/games/"+gameID+"/move", map[string]int{"x": 7, "y": 7})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for occupied, got %d", resp.StatusCode)
	}
}

func TestUndoAndReset(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	client := newTestClient(t)
	registerUser(t, client, ts.URL, "Alice", "alice_03", "secret123")
	gameID := createGame(t, client, ts.URL)

	_ = postJSON(t, client, ts.URL+"/api/games/"+gameID+"/move", map[string]int{"x": 0, "y": 0})

	resp := postJSON(t, client, ts.URL+"/api/games/"+gameID+"/undo", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on undo, got %d", resp.StatusCode)
	}

	resp = postJSON(t, client, ts.URL+"/api/games/"+gameID+"/reset", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on reset, got %d", resp.StatusCode)
	}
}

func TestGameNotFound(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	client := newTestClient(t)
	registerUser(t, client, ts.URL, "Alice", "alice_04", "secret123")

	resp, err := client.Get(ts.URL + "/api/games/doesnotexist")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestGameIsolationBetweenUsers(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	alice := newTestClient(t)
	registerUser(t, alice, ts.URL, "Alice", "alice_05", "secret123")
	gameID := createGame(t, alice, ts.URL)

	bob := newTestClient(t)
	registerUser(t, bob, ts.URL, "Bob", "bob_05", "secret123")

	resp, err := bob.Get(ts.URL + "/api/games/" + gameID)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for foreign game, got %d", resp.StatusCode)
	}
}
