package server

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/cursor/gomoku/internal/room"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // 简化：允许任意来源
}

const (
	wsWriteWait  = 10 * time.Second
	wsPongWait   = 60 * time.Second
	wsPingPeriod = (wsPongWait * 9) / 10
	wsReadLimit  = 4096
)

// wsClient 实现 room.Sender，并将房间推送的消息序列化到 WebSocket。
type wsClient struct {
	id     string
	conn   *websocket.Conn
	send   chan []byte
	once   sync.Once
	closed chan struct{}
}

func newWSClient(conn *websocket.Conn) *wsClient {
	id := randID(6)
	return &wsClient{
		id:     id,
		conn:   conn,
		send:   make(chan []byte, 16),
		closed: make(chan struct{}),
	}
}

func (c *wsClient) ID() string { return c.id }

func (c *wsClient) Send(payload []byte) error {
	select {
	case c.send <- payload:
		return nil
	case <-c.closed:
		return websocket.ErrCloseSent
	default:
		// 通道满，关闭客户端避免阻塞房间
		c.Close()
		return websocket.ErrCloseSent
	}
}

func (c *wsClient) Close() {
	c.once.Do(func() {
		close(c.closed)
		_ = c.conn.Close()
	})
}

// /ws/rooms/{roomID}?role=black|white|spectator
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/ws/rooms/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(w, "未指定房间 ID", http.StatusBadRequest)
		return
	}
	rm := s.hub.Get(id)
	if rm == nil {
		http.Error(w, "房间不存在", http.StatusNotFound)
		return
	}
	prefer := room.Role(strings.ToLower(r.URL.Query().Get("role")))

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("升级 WebSocket 失败: %v", err)
		return
	}
	conn.SetReadLimit(wsReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(wsPongWait))
	})

	client := newWSClient(conn)
	role, err := rm.Join(client, prefer)
	if err != nil {
		log.Printf("加入房间失败: %v", err)
		client.Close()
		return
	}
	log.Printf("ws %s 加入房间 %s 角色=%s", client.ID(), rm.ID(), role)

	go writePump(client)
	go func() {
		readPump(client, rm)
		rm.Leave(client)
		log.Printf("ws %s 离开房间 %s", client.ID(), rm.ID())
	}()
}

func readPump(c *wsClient, rm *room.Room) {
	defer c.Close()
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("读消息异常: %v", err)
			}
			return
		}
		rm.HandleMessage(c, msg)
	}
}

func writePump(c *wsClient) {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		c.Close()
	}()
	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.closed:
			return
		}
	}
}

func randID(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
