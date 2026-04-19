package room

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"

	"github.com/cursor/gomoku/internal/ai"
)

// Hub 维护所有房间。
type Hub struct {
	mu     sync.RWMutex
	rooms  map[string]*Room
	engine *ai.Engine
}

// NewHub 创建一个新的 hub。
func NewHub(engine *ai.Engine) *Hub {
	if engine == nil {
		engine = ai.New()
	}
	return &Hub{rooms: make(map[string]*Room), engine: engine}
}

// Create 新建房间。
func (h *Hub) Create(mode Mode, diff ai.Difficulty) (*Room, error) {
	if mode == "" {
		mode = ModePvP
	}
	id, err := newID()
	if err != nil {
		return nil, err
	}
	r := New(Config{
		ID:         id,
		Mode:       mode,
		Difficulty: diff,
		Engine:     h.engine,
		OnEmpty:    h.remove,
	})
	h.mu.Lock()
	h.rooms[id] = r
	h.mu.Unlock()
	return r, nil
}

// Get 返回指定 ID 的房间，若不存在返回 nil。
func (h *Hub) Get(id string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[id]
}

// List 列出所有房间的描述。
func (h *Hub) List() []RoomInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]RoomInfo, 0, len(h.rooms))
	for _, r := range h.rooms {
		out = append(out, r.Info())
	}
	return out
}

// Count 返回当前房间数量。
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms)
}

func (h *Hub) remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, id)
}

func newID() (string, error) {
	var buf [6]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

// 兼容旧错误。
var ErrRoomNotFound = errors.New("room: 房间不存在")
