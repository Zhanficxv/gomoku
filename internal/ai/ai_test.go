package ai

import (
	"testing"

	"github.com/cursor/gomoku/internal/game"
)

func TestFirstMoveIsCenter(t *testing.T) {
	e := New()
	g := game.New()
	for _, diff := range []Difficulty{Easy, Medium, Hard} {
		m, err := e.Choose(g.State(), game.Black, diff)
		if err != nil {
			t.Fatalf("%s err: %v", diff, err)
		}
		if m.X != game.BoardSize/2 || m.Y != game.BoardSize/2 {
			t.Fatalf("%s expected center, got (%d,%d)", diff, m.X, m.Y)
		}
	}
}

// AI 应该立即完成五连胜（self 立即赢）
func TestAITakesImmediateWin(t *testing.T) {
	e := New()
	g := game.New()
	// 黑：(0..3, 0)；白：(0..3, 1)；轮到黑，黑可在 (4,0) 胜
	moves := []struct{ x, y int }{
		{0, 0}, {0, 1},
		{1, 0}, {1, 1},
		{2, 0}, {2, 1},
		{3, 0}, {3, 1},
	}
	for _, m := range moves {
		if _, err := g.Place(m.x, m.y, game.Empty); err != nil {
			t.Fatal(err)
		}
	}
	for _, diff := range []Difficulty{Easy, Medium, Hard} {
		m, err := e.Choose(g.State(), game.Black, diff)
		if err != nil {
			t.Fatalf("%s: %v", diff, err)
		}
		if m.X != 4 || m.Y != 0 {
			t.Fatalf("%s expected immediate win at (4,0), got (%d,%d)", diff, m.X, m.Y)
		}
	}
}

// AI 应该堵掉对手的活四 / 立即胜（medium/hard）
func TestAIBlocksOpponentWin(t *testing.T) {
	e := New()
	g := game.New()
	// 让黑下成 (1..4, 7)（连 4），白需阻止 (0,7) 或 (5,7)
	// 顺序：B(1,7) W(0,0) B(2,7) W(0,1) B(3,7) W(0,2) B(4,7)；现在轮到 W
	seq := []struct{ x, y int }{
		{1, 7}, {0, 0},
		{2, 7}, {0, 1},
		{3, 7}, {0, 2},
		{4, 7},
	}
	for _, m := range seq {
		if _, err := g.Place(m.x, m.y, game.Empty); err != nil {
			t.Fatal(err)
		}
	}
	for _, diff := range []Difficulty{Medium, Hard} {
		m, err := e.Choose(g.State(), game.White, diff)
		if err != nil {
			t.Fatalf("%s: %v", diff, err)
		}
		if !((m.X == 0 && m.Y == 7) || (m.X == 5 && m.Y == 7)) {
			t.Fatalf("%s expected to block at (0,7) or (5,7), got (%d,%d)", diff, m.X, m.Y)
		}
	}
}

func TestAIChoiceWithinBoardAndEmpty(t *testing.T) {
	e := New()
	g := game.New()
	_, _ = g.Place(7, 7, game.Black)
	for _, diff := range []Difficulty{Easy, Medium, Hard} {
		m, err := e.Choose(g.State(), game.White, diff)
		if err != nil {
			t.Fatalf("%s: %v", diff, err)
		}
		if m.X < 0 || m.X >= game.BoardSize || m.Y < 0 || m.Y >= game.BoardSize {
			t.Fatalf("%s out of board: %v", diff, m)
		}
		if g.State().Board[m.Y][m.X] != game.Empty {
			t.Fatalf("%s picked occupied cell", diff)
		}
		if m.Stone != game.White {
			t.Fatalf("%s wrong stone color: %v", diff, m.Stone)
		}
	}
}

func TestParseDifficulty(t *testing.T) {
	cases := map[string]Difficulty{
		"easy":   Easy,
		"medium": Medium,
		"hard":   Hard,
		"":       Medium,
		"foo":    Medium,
	}
	for in, want := range cases {
		if got := ParseDifficulty(in); got != want {
			t.Errorf("ParseDifficulty(%q) = %v, want %v", in, got, want)
		}
	}
}
