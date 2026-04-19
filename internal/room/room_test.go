package room

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/cursor/gomoku/internal/ai"
	"github.com/cursor/gomoku/internal/game"
)

// fakeSender 是一个测试用的 Sender 实现。
type fakeSender struct {
	id     string
	inbox  chan []byte
	closed bool
}

func newFake(id string) *fakeSender {
	return &fakeSender{id: id, inbox: make(chan []byte, 64)}
}

func (f *fakeSender) ID() string { return f.id }
func (f *fakeSender) Send(p []byte) error {
	if f.closed {
		return nil
	}
	cp := make([]byte, len(p))
	copy(cp, p)
	select {
	case f.inbox <- cp:
	default:
	}
	return nil
}
func (f *fakeSender) Close() { f.closed = true }

// receiveState 等待并返回最新的 state 帧（自动跳过 error 帧）。
func receiveState(t *testing.T, f *fakeSender) State {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case b := <-f.inbox:
			var env struct {
				Type string          `json:"type"`
				Data json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(b, &env); err != nil {
				t.Fatalf("解析消息失败: %v", err)
			}
			if env.Type != "state" {
				continue
			}
			var st State
			if err := json.Unmarshal(env.Data, &st); err != nil {
				t.Fatalf("解析 state 失败: %v", err)
			}
			return st
		case <-deadline:
			t.Fatalf("等待 state 超时")
		}
	}
}

// drainErrors 等待 error 消息。
func receiveError(t *testing.T, f *fakeSender) string {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case b := <-f.inbox:
			var env struct {
				Type string `json:"type"`
				Data struct {
					Message string `json:"message"`
				} `json:"data"`
			}
			if err := json.Unmarshal(b, &env); err != nil {
				t.Fatalf("解析消息失败: %v", err)
			}
			if env.Type == "error" {
				return env.Data.Message
			}
		case <-deadline:
			t.Fatalf("等待 error 超时")
		}
	}
}

func TestPvPJoinAndMove(t *testing.T) {
	r := New(Config{ID: "r1", Mode: ModePvP, Engine: ai.New()})

	a := newFake("a")
	b := newFake("b")
	roleA, err := r.Join(a, "")
	if err != nil || roleA != RoleBlack {
		t.Fatalf("expected black, got %v err=%v", roleA, err)
	}
	roleB, err := r.Join(b, "")
	if err != nil || roleB != RoleWhite {
		t.Fatalf("expected white, got %v err=%v", roleB, err)
	}
	// 初始 state 推送
	_ = receiveState(t, a)
	_ = receiveState(t, b)

	r.HandleMessage(a, []byte(`{"type":"move","x":7,"y":7}`))
	stA := receiveState(t, a)
	stB := receiveState(t, b)
	if stA.Game.Board[7][7] != game.Black || stB.Game.Board[7][7] != game.Black {
		t.Fatalf("expected black at (7,7)")
	}
	if stA.Game.Turn != game.White {
		t.Fatalf("expected next turn white, got %v", stA.Game.Turn)
	}
}

func TestPvPRejectsWrongTurn(t *testing.T) {
	r := New(Config{ID: "r2", Mode: ModePvP, Engine: ai.New()})
	a, b := newFake("a"), newFake("b")
	_, _ = r.Join(a, "")
	_, _ = r.Join(b, "")
	_ = receiveState(t, a)
	_ = receiveState(t, b)

	// 白方不能先下
	r.HandleMessage(b, []byte(`{"type":"move","x":7,"y":7}`))
	msg := receiveError(t, b)
	if msg == "" {
		t.Fatalf("expected error message")
	}
}

func TestSpectatorCannotMove(t *testing.T) {
	r := New(Config{ID: "r3", Mode: ModePvP, Engine: ai.New()})
	a, b, c := newFake("a"), newFake("b"), newFake("c")
	_, _ = r.Join(a, "")
	_, _ = r.Join(b, "")
	role, err := r.Join(c, "")
	if err != nil || role != RoleSpectator {
		t.Fatalf("expected spectator, got %v err=%v", role, err)
	}
	_ = receiveState(t, a)
	_ = receiveState(t, b)
	_ = receiveState(t, c)

	r.HandleMessage(c, []byte(`{"type":"move","x":7,"y":7}`))
	msg := receiveError(t, c)
	if msg == "" {
		t.Fatalf("expected error for spectator move")
	}
}

func TestAIMovesAfterHuman(t *testing.T) {
	r := New(Config{ID: "rai", Mode: ModeAI, Difficulty: ai.Easy, Engine: ai.New()})
	human := newFake("h")
	role, err := r.Join(human, RoleBlack)
	if err != nil || role != RoleBlack {
		t.Fatalf("expected black, got %v err=%v", role, err)
	}
	// 收到加入推送
	_ = receiveState(t, human)

	r.HandleMessage(human, []byte(`{"type":"move","x":7,"y":7}`))
	// 第一帧：人类落子后的 state
	st1 := receiveState(t, human)
	if st1.Game.Board[7][7] != game.Black {
		t.Fatalf("expected black at (7,7), got %v", st1.Game.Board[7][7])
	}
	// 第二帧：AI 落子后的 state（异步 + 思考延迟）
	deadline := time.After(3 * time.Second)
	for {
		st := receiveState(t, human)
		if st.Game.Turn == game.Black && countWhite(st.Game.Board) == 1 {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("AI 未在限定时间内落子")
		default:
		}
	}
}

func TestAIPlaysFirstWhenBlack(t *testing.T) {
	r := New(Config{ID: "rai2", Mode: ModeAI, Difficulty: ai.Easy, Engine: ai.New()})
	human := newFake("h")
	role, err := r.Join(human, RoleWhite)
	if err != nil || role != RoleWhite {
		t.Fatalf("expected white, got %v err=%v", role, err)
	}
	// 收到加入快照
	_ = receiveState(t, human)
	// AI 应该作为黑棋先下，等到一个非空棋盘
	deadline := time.After(3 * time.Second)
	for {
		st := receiveState(t, human)
		if countBlack(st.Game.Board) == 1 && st.Game.Turn == game.White {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("AI 未在限定时间内先手")
		default:
		}
	}
}

func TestParseModeAndDifficulty(t *testing.T) {
	if _, err := ParseMode("xyz"); err == nil {
		t.Fatalf("expected error")
	}
	if m, err := ParseMode("pvp"); err != nil || m != ModePvP {
		t.Fatalf("unexpected: %v %v", m, err)
	}
}

func countBlack(b [game.BoardSize][game.BoardSize]game.Stone) int {
	return countColor(b, game.Black)
}
func countWhite(b [game.BoardSize][game.BoardSize]game.Stone) int {
	return countColor(b, game.White)
}
func countColor(b [game.BoardSize][game.BoardSize]game.Stone, c game.Stone) int {
	n := 0
	for y := 0; y < game.BoardSize; y++ {
		for x := 0; x < game.BoardSize; x++ {
			if b[y][x] == c {
				n++
			}
		}
	}
	return n
}
