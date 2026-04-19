package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWebSocketRoomFlow(t *testing.T) {
	srv := New(nil)
	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	// 创建 PvP 房间
	resp, err := http.Post(ts.URL+"/api/rooms", "application/json", strings.NewReader(`{"mode":"pvp"}`))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var created struct {
		Room struct {
			ID string `json:"id"`
		} `json:"room"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/rooms/" + created.Room.ID + "?role=black"
	dialer := websocket.DefaultDialer
	a, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial a: %v", err)
	}
	defer a.Close()

	wsURLW := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/rooms/" + created.Room.ID + "?role=white"
	b, _, err := dialer.Dial(wsURLW, nil)
	if err != nil {
		t.Fatalf("dial b: %v", err)
	}
	defer b.Close()

	// 让黑落子
	if err := a.WriteJSON(map[string]any{"type": "move", "x": 7, "y": 7}); err != nil {
		t.Fatal(err)
	}

	// 在 a 与 b 上等到一个 board[7][7] == 1 的 state 帧
	waitMove := func(c *websocket.Conn) {
		c.SetReadDeadline(time.Now().Add(3 * time.Second))
		for {
			_, raw, err := c.ReadMessage()
			if err != nil {
				t.Fatalf("read err: %v", err)
			}
			var env struct {
				Type string `json:"type"`
				Data struct {
					Game struct {
						Board [15][15]int `json:"board"`
					} `json:"game"`
					You struct {
						Role string `json:"role"`
					} `json:"you"`
				} `json:"data"`
			}
			if err := json.Unmarshal(raw, &env); err != nil {
				continue
			}
			if env.Type != "state" {
				continue
			}
			if env.Data.Game.Board[7][7] == 1 {
				return
			}
		}
	}
	waitMove(a)
	waitMove(b)
}
