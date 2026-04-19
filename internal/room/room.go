// Package room 提供五子棋的房间与连接管理，基于 WebSocket 实现实时对战与人机对弈。
package room

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/cursor/gomoku/internal/ai"
	"github.com/cursor/gomoku/internal/game"
)

// Mode 表示房间的对局模式。
type Mode string

const (
	ModePvP   Mode = "pvp"   // 双人联机
	ModeAI    Mode = "ai"    // 人机对战
	ModeLocal Mode = "local" // 本地双人（同一客户端）
)

// ParseMode 解析模式字符串。
func ParseMode(s string) (Mode, error) {
	switch Mode(s) {
	case ModePvP, ModeAI, ModeLocal:
		return Mode(s), nil
	default:
		return "", fmt.Errorf("未知模式: %s", s)
	}
}

// Role 表示客户端在房间中的角色。
type Role string

const (
	RoleBlack     Role = "black"
	RoleWhite     Role = "white"
	RoleSpectator Role = "spectator"
)

// PlayerInfo 是发送给客户端的玩家描述。
type PlayerInfo struct {
	Role     Role   `json:"role"`
	IsAI     bool   `json:"is_ai"`
	Online   bool   `json:"online"`
	ClientID string `json:"client_id,omitempty"`
}

// RoomInfo 是房间的描述信息（不含完整游戏状态）。
type RoomInfo struct {
	ID         string        `json:"id"`
	Mode       Mode          `json:"mode"`
	Difficulty ai.Difficulty `json:"difficulty,omitempty"`
	Players    []PlayerInfo  `json:"players"`
	Spectators int           `json:"spectators"`
	CreatedAt  time.Time     `json:"created_at"`
}

// State 是发送给客户端的完整房间快照。
type State struct {
	Room RoomInfo      `json:"room"`
	Game game.Snapshot `json:"game"`
	You  *YouInfo      `json:"you,omitempty"`
}

// YouInfo 描述当前接收消息的客户端在房间中的角色。
type YouInfo struct {
	Role     Role   `json:"role"`
	ClientID string `json:"client_id"`
}

// Sender 是房间向客户端推送消息的接口。Server 中用 *wsClient 实现。
type Sender interface {
	ID() string
	Send(payload []byte) error
	Close()
}

// Room 表示一个对局房间。所有公共方法均为协程安全。
type Room struct {
	id         string
	mode       Mode
	difficulty ai.Difficulty
	createdAt  time.Time

	mu         sync.Mutex
	g          *game.Game
	black      Sender // 可能为 nil；AI 模式下其中一方将持有特殊的 aiSender
	white      Sender
	spectators map[string]Sender

	engine *ai.Engine // 仅 AI 模式使用

	onEmpty func(id string) // 房间空置时的回调（用于 hub 清理）
}

// Config 配置房间。
type Config struct {
	ID         string
	Mode       Mode
	Difficulty ai.Difficulty
	Engine     *ai.Engine
	OnEmpty    func(id string)
}

// New 创建一个新房间。
func New(cfg Config) *Room {
	return &Room{
		id:         cfg.ID,
		mode:       cfg.Mode,
		difficulty: cfg.Difficulty,
		createdAt:  time.Now(),
		g:          game.New(),
		spectators: make(map[string]Sender),
		engine:     cfg.Engine,
		onEmpty:    cfg.OnEmpty,
	}
}

// ID 返回房间 ID。
func (r *Room) ID() string { return r.id }

// Info 返回房间描述（不加锁版本前提：调用方需自行加锁）。
func (r *Room) infoLocked() RoomInfo {
	players := []PlayerInfo{
		{Role: RoleBlack, Online: r.black != nil, IsAI: r.isAISender(r.black)},
		{Role: RoleWhite, Online: r.white != nil, IsAI: r.isAISender(r.white)},
	}
	return RoomInfo{
		ID:         r.id,
		Mode:       r.mode,
		Difficulty: r.difficulty,
		Players:    players,
		Spectators: len(r.spectators),
		CreatedAt:  r.createdAt,
	}
}

// Info 是协程安全的版本。
func (r *Room) Info() RoomInfo {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.infoLocked()
}

// Snapshot 返回完整状态。
func (r *Room) Snapshot() State {
	r.mu.Lock()
	defer r.mu.Unlock()
	return State{Room: r.infoLocked(), Game: r.g.State()}
}

// ----- 加入与离开 -----

// Join 让一个客户端加入房间。
//   - prefer: 期望的角色，"" 或 "auto" 表示自动分配
//   - 返回实际分配的角色
func (r *Room) Join(c Sender, prefer Role) (Role, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.mode == ModeLocal {
		// 本地模式：允许多个观察者同时连接，落子由前端管理回合
		r.spectators[c.ID()] = c
		go r.broadcastStateForRole(c, RoleSpectator)
		return RoleSpectator, nil
	}

	if r.mode == ModeAI {
		// 人机模式：先确定 AI 颜色，再让人类拿到剩下的颜色
		if r.engine == nil {
			return "", errors.New("房间未配置 AI 引擎")
		}
		// 第一次有人加入时初始化 AI
		if r.black == nil && r.white == nil {
			aiColor := RoleWhite
			humanRole := RoleBlack
			if prefer == RoleWhite {
				aiColor = RoleBlack
				humanRole = RoleWhite
			}
			r.assignSenderLocked(aiColor, newAISender())
			if !r.assignHumanLocked(c, humanRole) {
				return "", errors.New("分配角色失败")
			}
			go r.broadcastStateForRole(c, humanRole)
			// 如果 AI 是黑棋（先手），让其立即落子
			if aiColor == RoleBlack {
				go r.aiMoveAsync()
			}
			return humanRole, nil
		}
		// 已有玩家则只能以观察者身份加入
		r.spectators[c.ID()] = c
		go r.broadcastStateForRole(c, RoleSpectator)
		return RoleSpectator, nil
	}

	// PvP
	role := prefer
	if role == "" || role == "auto" || role == RoleSpectator {
		switch {
		case r.black == nil:
			role = RoleBlack
		case r.white == nil:
			role = RoleWhite
		default:
			role = RoleSpectator
		}
	}
	if role == RoleBlack {
		if r.black != nil {
			role = roleIfFree(r.white, RoleWhite)
		}
	} else if role == RoleWhite {
		if r.white != nil {
			role = roleIfFree(r.black, RoleBlack)
		}
	}
	if role == "" {
		role = RoleSpectator
	}

	if role == RoleSpectator {
		r.spectators[c.ID()] = c
		go r.broadcastStateForRole(c, RoleSpectator)
		return RoleSpectator, nil
	}
	if !r.assignHumanLocked(c, role) {
		role = RoleSpectator
		r.spectators[c.ID()] = c
	}
	go r.broadcastStateForRole(c, role)
	return role, nil
}

func roleIfFree(other Sender, otherRole Role) Role {
	if other == nil {
		return otherRole
	}
	return RoleSpectator
}

func (r *Room) assignHumanLocked(c Sender, role Role) bool {
	switch role {
	case RoleBlack:
		if r.black != nil {
			return false
		}
		r.black = c
	case RoleWhite:
		if r.white != nil {
			return false
		}
		r.white = c
	default:
		return false
	}
	return true
}

func (r *Room) assignSenderLocked(role Role, s Sender) {
	switch role {
	case RoleBlack:
		r.black = s
	case RoleWhite:
		r.white = s
	}
}

// Leave 移除客户端。
func (r *Room) Leave(c Sender) {
	r.mu.Lock()
	empty := false
	switch {
	case r.black == c:
		r.black = nil
	case r.white == c:
		r.white = nil
	default:
		delete(r.spectators, c.ID())
	}
	// AI 占位不算"在线人类"
	humans := 0
	if r.black != nil && !r.isAISender(r.black) {
		humans++
	}
	if r.white != nil && !r.isAISender(r.white) {
		humans++
	}
	humans += len(r.spectators)
	if humans == 0 {
		empty = true
	}
	r.mu.Unlock()
	r.broadcastState()
	if empty && r.onEmpty != nil {
		r.onEmpty(r.id)
	}
}

// ----- 操作 -----

// HandleMessage 处理来自客户端的 JSON 消息。
func (r *Room) HandleMessage(c Sender, raw []byte) {
	var msg struct {
		Type string `json:"type"`
		X    int    `json:"x"`
		Y    int    `json:"y"`
		Text string `json:"text,omitempty"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		r.sendError(c, "无效的 JSON")
		return
	}
	switch msg.Type {
	case "move":
		r.handleMove(c, msg.X, msg.Y)
	case "undo":
		r.handleUndo(c)
	case "reset":
		r.handleReset(c)
	case "state":
		// 客户端主动请求快照
		state := r.Snapshot()
		r.sendStateTo(c, state)
	default:
		r.sendError(c, "未知消息类型: "+msg.Type)
	}
}

func (r *Room) roleOf(c Sender) Role {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch {
	case r.black == c:
		return RoleBlack
	case r.white == c:
		return RoleWhite
	default:
		return RoleSpectator
	}
}

func (r *Room) handleMove(c Sender, x, y int) {
	r.mu.Lock()
	if r.mode == ModeLocal {
		// 本地模式不区分玩家颜色
		_, err := r.g.Place(x, y, game.Empty)
		r.mu.Unlock()
		if err != nil {
			r.sendError(c, err.Error())
			return
		}
		r.broadcastState()
		return
	}

	role := r.roleOfLocked(c)
	if role != RoleBlack && role != RoleWhite {
		r.mu.Unlock()
		r.sendError(c, "观察者无法落子")
		return
	}
	stone := game.Black
	if role == RoleWhite {
		stone = game.White
	}
	if r.g.State().Turn != stone {
		r.mu.Unlock()
		r.sendError(c, "还没轮到你")
		return
	}
	if _, err := r.g.Place(x, y, stone); err != nil {
		r.mu.Unlock()
		r.sendError(c, err.Error())
		return
	}
	mode := r.mode
	gameOver := r.g.State().Status != game.StatusPlaying
	r.mu.Unlock()
	r.broadcastState()

	if mode == ModeAI && !gameOver {
		go r.aiMoveAsync()
	}
}

func (r *Room) roleOfLocked(c Sender) Role {
	switch {
	case r.black == c:
		return RoleBlack
	case r.white == c:
		return RoleWhite
	}
	return RoleSpectator
}

func (r *Room) handleUndo(c Sender) {
	r.mu.Lock()
	if r.mode == ModeAI {
		// 人机模式：连续悔两步（撤掉 AI 与玩家各一手），保证仍然是人类回合
		_, err := r.g.Undo()
		if err != nil {
			r.mu.Unlock()
			r.sendError(c, err.Error())
			return
		}
		_, _ = r.g.Undo()
		r.mu.Unlock()
		r.broadcastState()
		return
	}
	_, err := r.g.Undo()
	r.mu.Unlock()
	if err != nil {
		r.sendError(c, err.Error())
		return
	}
	r.broadcastState()
}

func (r *Room) handleReset(c Sender) {
	r.mu.Lock()
	r.g.Reset()
	mode := r.mode
	aiIsBlack := r.isAISender(r.black)
	r.mu.Unlock()
	r.broadcastState()

	if mode == ModeAI && aiIsBlack {
		go r.aiMoveAsync()
	}
}

// ----- AI 落子 -----

func (r *Room) aiMoveAsync() {
	r.mu.Lock()
	if r.mode != ModeAI || r.engine == nil {
		r.mu.Unlock()
		return
	}
	snap := r.g.State()
	if snap.Status != game.StatusPlaying {
		r.mu.Unlock()
		return
	}
	var aiColor game.Stone
	switch {
	case r.isAISender(r.black) && snap.Turn == game.Black:
		aiColor = game.Black
	case r.isAISender(r.white) && snap.Turn == game.White:
		aiColor = game.White
	default:
		r.mu.Unlock()
		return
	}
	diff := r.difficulty
	r.mu.Unlock()

	// 模拟轻微的"思考"时间，让 UI 不至于瞬间出现
	time.Sleep(180 * time.Millisecond)

	move, err := r.engine.Choose(snap, aiColor, diff)
	if err != nil {
		log.Printf("AI 选择失败: %v", err)
		return
	}
	r.mu.Lock()
	if _, err := r.g.Place(move.X, move.Y, aiColor); err != nil {
		log.Printf("AI 落子失败: %v", err)
	}
	r.mu.Unlock()
	r.broadcastState()
}

// ----- 广播 -----

func (r *Room) broadcastState() {
	state := r.Snapshot()
	r.mu.Lock()
	receivers := r.collectReceiversLocked()
	r.mu.Unlock()
	for _, item := range receivers {
		r.sendStateToWithRole(item.sender, state, item.role)
	}
}

type recv struct {
	sender Sender
	role   Role
}

func (r *Room) collectReceiversLocked() []recv {
	out := make([]recv, 0, 4+len(r.spectators))
	if r.black != nil && !r.isAISender(r.black) {
		out = append(out, recv{r.black, RoleBlack})
	}
	if r.white != nil && !r.isAISender(r.white) {
		out = append(out, recv{r.white, RoleWhite})
	}
	for _, s := range r.spectators {
		out = append(out, recv{s, RoleSpectator})
	}
	return out
}

func (r *Room) broadcastStateForRole(c Sender, role Role) {
	state := r.Snapshot()
	r.sendStateToWithRole(c, state, role)
}

func (r *Room) sendStateTo(c Sender, state State) {
	r.sendStateToWithRole(c, state, r.roleOf(c))
}

func (r *Room) sendStateToWithRole(c Sender, state State, role Role) {
	state.You = &YouInfo{Role: role, ClientID: c.ID()}
	envelope := map[string]any{"type": "state", "data": state}
	b, err := json.Marshal(envelope)
	if err != nil {
		log.Printf("编码 state 失败: %v", err)
		return
	}
	if err := c.Send(b); err != nil {
		log.Printf("发送 state 给 %s 失败: %v", c.ID(), err)
	}
}

func (r *Room) sendError(c Sender, msg string) {
	envelope := map[string]any{"type": "error", "data": map[string]string{"message": msg}}
	b, _ := json.Marshal(envelope)
	if err := c.Send(b); err != nil {
		log.Printf("发送 error 给 %s 失败: %v", c.ID(), err)
	}
}

// isAISender 判断 sender 是否为 AI 占位连接。
func (r *Room) isAISender(s Sender) bool {
	if s == nil {
		return false
	}
	_, ok := s.(*aiSender)
	return ok
}

// ----- AI Sender 占位 -----

// aiSender 是一个不真正发送数据的 Sender 实现，只为占据房间中的"对手"位置。
type aiSender struct {
	id string
}

func newAISender() *aiSender {
	return &aiSender{id: "ai"}
}

func (a *aiSender) ID() string          { return a.id }
func (a *aiSender) Send(_ []byte) error { return nil }
func (a *aiSender) Close()              {}
