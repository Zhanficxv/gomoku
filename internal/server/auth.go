package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode"
)

const sessionCookieName = "gomoku_session"

var (
	errAuthRequired       = errors.New("请先登录后再开始游戏")
	errInvalidCredentials = errors.New("用户名或密码错误")
)

type user struct {
	ID           string
	Name         string
	Username     string
	PasswordSalt string
	PasswordHash string
	CreatedAt    time.Time
}

type session struct {
	UserID    string
	CreatedAt time.Time
}

type publicUser struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Username  string `json:"username"`
	CreatedAt string `json:"created_at"`
}

func (u *user) public() publicUser {
	return publicUser{
		ID:        u.ID,
		Name:      u.Name,
		Username:  u.Username,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
}

func (s *Server) registerAuthRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/auth/register", s.handleRegister)
	mux.HandleFunc("/api/auth/login", s.handleLogin)
	mux.HandleFunc("/api/auth/logout", s.handleLogout)
	mux.HandleFunc("/api/auth/me", s.handleMe)
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}

	var req struct {
		Name     string `json:"name"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "无效的 JSON")
		return
	}

	name := strings.TrimSpace(req.Name)
	username := strings.TrimSpace(req.Username)
	usernameKey := normalizeUsername(username)
	password := req.Password

	if err := validateDisplayName(name); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateUsername(usernameKey); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validatePassword(password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.mu.RLock()
	_, exists := s.users[usernameKey]
	s.mu.RUnlock()
	if exists {
		writeError(w, http.StatusConflict, "用户名已存在")
		return
	}

	userID, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "创建用户失败")
		return
	}
	salt, hash, err := hashPassword(password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "创建用户失败")
		return
	}

	u := &user{
		ID:           userID,
		Name:         name,
		Username:     usernameKey,
		PasswordSalt: salt,
		PasswordHash: hash,
		CreatedAt:    time.Now(),
	}

	s.mu.Lock()
	if _, ok := s.users[usernameKey]; ok {
		s.mu.Unlock()
		writeError(w, http.StatusConflict, "用户名已存在")
		return
	}
	s.users[usernameKey] = u
	s.usersByID[u.ID] = u
	s.mu.Unlock()

	if err := s.startSession(w, u); err != nil {
		writeError(w, http.StatusInternalServerError, "创建会话失败")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": u.public()})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "无效的 JSON")
		return
	}

	usernameKey := normalizeUsername(req.Username)
	s.mu.RLock()
	u := s.users[usernameKey]
	s.mu.RUnlock()
	if u == nil || !verifyPassword(u.PasswordSalt, u.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, errInvalidCredentials.Error())
		return
	}

	if err := s.startSession(w, u); err != nil {
		writeError(w, http.StatusInternalServerError, "创建会话失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u.public()})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}

	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		s.mu.Lock()
		delete(s.sessions, cookie.Value)
		s.mu.Unlock()
	}
	clearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 GET")
		return
	}

	u, ok := s.currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "当前未登录")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u.public()})
}

func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (*user, bool) {
	u, ok := s.currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, errAuthRequired.Error())
		return nil, false
	}
	return u, true
}

func (s *Server) currentUser(r *http.Request) (*user, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil, false
	}

	s.mu.RLock()
	session := s.sessions[cookie.Value]
	u := s.usersByID[session.UserID]
	s.mu.RUnlock()
	if u == nil {
		return nil, false
	}
	return u, true
}

func (s *Server) startSession(w http.ResponseWriter, u *user) error {
	token, err := newSessionToken()
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.sessions[token] = session{
		UserID:    u.ID,
		CreatedAt: time.Now(),
	}
	s.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 24 * 7,
	})
	return nil
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func newSessionToken() (string, error) {
	var buf [24]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf[:]), nil
}

func normalizeUsername(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func validateDisplayName(v string) error {
	n := utf8Len(v)
	switch {
	case n < 2:
		return errors.New("昵称至少需要 2 个字符")
	case n > 24:
		return errors.New("昵称不能超过 24 个字符")
	default:
		return nil
	}
}

func validateUsername(v string) error {
	n := len(v)
	switch {
	case n < 3:
		return errors.New("用户名至少需要 3 个字符")
	case n > 20:
		return errors.New("用户名不能超过 20 个字符")
	}
	for _, r := range v {
		if unicode.IsLower(r) || unicode.IsDigit(r) || r == '_' {
			continue
		}
		return errors.New("用户名仅支持小写字母、数字与下划线")
	}
	return nil
}

func validatePassword(v string) error {
	n := utf8Len(v)
	switch {
	case n < 6:
		return errors.New("密码至少需要 6 个字符")
	case n > 64:
		return errors.New("密码不能超过 64 个字符")
	default:
		return nil
	}
}

func hashPassword(password string) (string, string, error) {
	var salt [16]byte
	if _, err := rand.Read(salt[:]); err != nil {
		return "", "", err
	}
	sum := sha256.Sum256(append(salt[:], []byte(password)...))
	return base64.RawStdEncoding.EncodeToString(salt[:]), base64.RawStdEncoding.EncodeToString(sum[:]), nil
}

func verifyPassword(saltText, hashText, password string) bool {
	salt, err := base64.RawStdEncoding.DecodeString(saltText)
	if err != nil {
		return false
	}
	sum := sha256.Sum256(append(salt, []byte(password)...))
	current := base64.RawStdEncoding.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(current), []byte(hashText)) == 1
}

func utf8Len(v string) int {
	n := 0
	for range v {
		n++
	}
	return n
}
