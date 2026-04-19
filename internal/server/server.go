// Package server 提供五子棋游戏的 HTTP 接口与静态资源服务。
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
	"time"

	"github.com/cursor/gomoku/internal/game"
)

type managedGame struct {
	OwnerID   string
	Game      *game.Game
	CreatedAt time.Time
}

// Server 维护多局游戏并提供 HTTP API。
type Server struct {
	mu        sync.RWMutex
	games     map[string]managedGame
	users     map[string]*user
	usersByID map[string]*user
	sessions  map[string]session
	staticFS  fs.FS
}

// New 创建一个 Server，staticFS 为前端静态资源（可为 nil）。
func New(staticFS fs.FS) *Server {
	return &Server{
		games:     make(map[string]managedGame),
		users:     make(map[string]*user),
		usersByID: make(map[string]*user),
		sessions:  make(map[string]session),
		staticFS:  staticFS,
	}
}

// Routes 返回配置好的 http.Handler。
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	s.registerAuthRoutes(mux)
	mux.HandleFunc("/api/games", s.handleGames)     // POST 创建
	mux.HandleFunc("/api/games/", s.handleGameByID) // /api/games/{id}[/move|/undo|/reset]
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

// 创建游戏：POST /api/games
func (s *Server) handleGames(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "生成 ID 失败")
		return
	}
	g := game.New()
	s.mu.Lock()
	s.games[id] = managedGame{
		OwnerID:   u.ID,
		Game:      g,
		CreatedAt: time.Now(),
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":    id,
		"owner": u.public(),
		"state": g.State(),
	})
}

// /api/games/{id}[/move|/undo|/reset]
func (s *Server) handleGameByID(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/games/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "未指定游戏 ID")
		return
	}
	id := parts[0]
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	g := s.getOwnedGame(id, u.ID)
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

func (s *Server) getOwnedGame(id, ownerID string) *game.Game {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, exists := s.games[id]
	if !exists || entry.OwnerID != ownerID {
		return nil
	}
	return entry.Game
}

func newID() (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
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
