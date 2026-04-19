// Package server 提供五子棋的 HTTP / WebSocket 接口与静态资源服务。
package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/cursor/gomoku/internal/ai"
	"github.com/cursor/gomoku/internal/game"
	"github.com/cursor/gomoku/internal/room"
)

// Server 维护本地单机对局（REST）以及联机/人机房间（WebSocket）。
type Server struct {
	mu       sync.RWMutex
	games    map[string]*game.Game
	hub      *room.Hub
	staticFS fs.FS
}

// New 创建一个 Server，staticFS 为前端静态资源（可为 nil）。
func New(staticFS fs.FS) *Server {
	return &Server{
		games:    make(map[string]*game.Game),
		hub:      room.NewHub(ai.New()),
		staticFS: staticFS,
	}
}

// Routes 返回配置好的 http.Handler。
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// 本地单机对局（保持向后兼容）
	mux.HandleFunc("/api/games", s.handleGames)
	mux.HandleFunc("/api/games/", s.handleGameByID)

	// 房间 / 联机 / 人机
	mux.HandleFunc("/api/rooms", s.handleRooms)
	mux.HandleFunc("/api/rooms/", s.handleRoomByID)
	mux.HandleFunc("/ws/rooms/", s.handleWS)

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	if s.staticFS != nil {
		mux.Handle("/", http.FileServer(http.FS(s.staticFS)))
	}
	return logRequests(mux)
}

func logRequests(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		h.ServeHTTP(w, r)
	})
}

// ===== 本地单机 REST =====

func (s *Server) handleGames(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}
	id, err := newID(8)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "生成 ID 失败")
		return
	}
	g := game.New()
	s.mu.Lock()
	s.games[id] = g
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":    id,
		"state": g.State(),
	})
}

func (s *Server) handleGameByID(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/games/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "未指定游戏 ID")
		return
	}
	id := parts[0]
	g := s.getGame(id)
	if g == nil {
		writeError(w, http.StatusNotFound, "游戏不存在")
		return
	}
	action := ""
	if len(parts) == 2 {
		action = parts[1]
	}

	switch action {
	case "":
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "仅支持 GET")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "state": g.State()})
	case "move":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
			return
		}
		s.handleMove(w, r, id, g)
	case "undo":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
			return
		}
		state, err := g.Undo()
		if err != nil {
			writeGameError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "state": state})
	case "reset":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
			return
		}
		state := g.Reset()
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "state": state})
	default:
		writeError(w, http.StatusNotFound, "未知的动作: "+action)
	}
}

func (s *Server) handleMove(w http.ResponseWriter, r *http.Request, id string, g *game.Game) {
	var req struct {
		X     int         `json:"x"`
		Y     int         `json:"y"`
		Stone *game.Stone `json:"stone,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "无效的 JSON")
		return
	}
	stone := game.Empty
	if req.Stone != nil {
		stone = *req.Stone
	}
	state, err := g.Place(req.X, req.Y, stone)
	if err != nil {
		writeGameError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "state": state})
}

func (s *Server) getGame(id string) *game.Game {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.games[id]
}

// ===== 房间 REST（创建 / 列表 / 查询） =====

func (s *Server) handleRooms(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"rooms": s.hub.List()})
	case http.MethodPost:
		var req struct {
			Mode       string `json:"mode"`
			Difficulty string `json:"difficulty"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req) // 允许空 body
		mode, err := room.ParseMode(req.Mode)
		if err != nil {
			if req.Mode == "" {
				mode = room.ModePvP
			} else {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
		}
		var diff ai.Difficulty
		if mode == room.ModeAI {
			diff = ai.ParseDifficulty(req.Difficulty)
		}
		rm, err := s.hub.Create(mode, diff)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"room": rm.Info(), "state": rm.Snapshot()})
	default:
		writeError(w, http.StatusMethodNotAllowed, "仅支持 GET 或 POST")
	}
}

func (s *Server) handleRoomByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 GET")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusNotFound, "未指定房间 ID")
		return
	}
	rm := s.hub.Get(id)
	if rm == nil {
		writeError(w, http.StatusNotFound, "房间不存在")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"room": rm.Info(), "state": rm.Snapshot()})
}

// ===== Helpers =====

func newID(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("写入响应失败: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeGameError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, game.ErrOutOfBoard),
		errors.Is(err, game.ErrCellOccupied),
		errors.Is(err, game.ErrWrongTurn),
		errors.Is(err, game.ErrNoMoveToUndo):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, game.ErrGameOver):
		writeError(w, http.StatusConflict, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
