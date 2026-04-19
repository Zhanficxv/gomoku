package game

import "testing"

func TestNewGameInitialState(t *testing.T) {
	g := New()
	s := g.State()
	if s.Turn != Black {
		t.Fatalf("expected first turn Black, got %v", s.Turn)
	}
	if s.Status != StatusPlaying {
		t.Fatalf("expected status playing, got %v", s.Status)
	}
	if s.Size != BoardSize {
		t.Fatalf("expected size %d, got %d", BoardSize, s.Size)
	}
}

func TestPlaceAlternatesTurns(t *testing.T) {
	g := New()
	if _, err := g.Place(7, 7, Black); err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	s := g.State()
	if s.Turn != White {
		t.Fatalf("expected turn White, got %v", s.Turn)
	}
	if _, err := g.Place(7, 7, White); err == nil {
		t.Fatalf("expected occupied error")
	}
	if _, err := g.Place(8, 7, White); err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if g.State().Turn != Black {
		t.Fatalf("expected turn Black again")
	}
}

func TestPlaceWrongTurn(t *testing.T) {
	g := New()
	if _, err := g.Place(0, 0, White); err != ErrWrongTurn {
		t.Fatalf("expected ErrWrongTurn, got %v", err)
	}
}

func TestPlaceOutOfBoard(t *testing.T) {
	g := New()
	if _, err := g.Place(-1, 0, Black); err != ErrOutOfBoard {
		t.Fatalf("expected ErrOutOfBoard, got %v", err)
	}
	if _, err := g.Place(0, BoardSize, Black); err != ErrOutOfBoard {
		t.Fatalf("expected ErrOutOfBoard, got %v", err)
	}
}

func TestHorizontalWin(t *testing.T) {
	g := New()
	// 黑：(0..4,0)；白：(0..3,1)
	moves := []struct{ x, y int }{
		{0, 0}, {0, 1},
		{1, 0}, {1, 1},
		{2, 0}, {2, 1},
		{3, 0}, {3, 1},
		{4, 0},
	}
	for _, m := range moves {
		if _, err := g.Place(m.x, m.y, Empty); err != nil {
			t.Fatalf("unexpected err at %v: %v", m, err)
		}
	}
	s := g.State()
	if s.Status != StatusBlackWin || s.Winner != Black {
		t.Fatalf("expected black win, got status=%v winner=%v", s.Status, s.Winner)
	}
	if len(s.WinLine) != 5 {
		t.Fatalf("expected win line of 5, got %d", len(s.WinLine))
	}
}

func TestDiagonalWin(t *testing.T) {
	g := New()
	// 黑沿主对角连成五子；白随便落在不影响的位置
	blacks := [][2]int{{0, 0}, {1, 1}, {2, 2}, {3, 3}, {4, 4}}
	whites := [][2]int{{0, 14}, {1, 14}, {2, 14}, {3, 14}}
	for i := 0; i < len(blacks); i++ {
		if _, err := g.Place(blacks[i][0], blacks[i][1], Black); err != nil {
			t.Fatalf("black err: %v", err)
		}
		if i < len(whites) {
			if _, err := g.Place(whites[i][0], whites[i][1], White); err != nil {
				t.Fatalf("white err: %v", err)
			}
		}
	}
	s := g.State()
	if s.Status != StatusBlackWin {
		t.Fatalf("expected black win, got %v", s.Status)
	}
}

func TestUndoRestoresState(t *testing.T) {
	g := New()
	if _, err := g.Place(7, 7, Black); err != nil {
		t.Fatal(err)
	}
	if _, err := g.Place(8, 8, White); err != nil {
		t.Fatal(err)
	}
	if _, err := g.Undo(); err != nil {
		t.Fatal(err)
	}
	s := g.State()
	if s.Turn != White {
		t.Fatalf("expected turn White after undo, got %v", s.Turn)
	}
	if s.Board[8][8] != Empty {
		t.Fatalf("expected (8,8) empty after undo")
	}
	if len(s.History) != 1 {
		t.Fatalf("expected history len 1, got %d", len(s.History))
	}
}

func TestUndoEmpty(t *testing.T) {
	g := New()
	if _, err := g.Undo(); err != ErrNoMoveToUndo {
		t.Fatalf("expected ErrNoMoveToUndo, got %v", err)
	}
}

func TestResetClearsBoard(t *testing.T) {
	g := New()
	_, _ = g.Place(0, 0, Black)
	_, _ = g.Place(1, 0, White)
	s := g.Reset()
	if s.Turn != Black || s.Status != StatusPlaying {
		t.Fatalf("expected reset state")
	}
	if len(s.History) != 0 {
		t.Fatalf("expected empty history")
	}
	for y := 0; y < BoardSize; y++ {
		for x := 0; x < BoardSize; x++ {
			if s.Board[y][x] != Empty {
				t.Fatalf("expected empty at (%d,%d)", x, y)
			}
		}
	}
}

func TestNoOverlineFalsePositive(t *testing.T) {
	// 验证 6 子连珠也判胜（标准五子棋无禁手版本下亦视为胜）
	g := New()
	moves := []struct{ x, y int }{
		{0, 0}, {0, 1},
		{1, 0}, {1, 1},
		{2, 0}, {2, 1},
		{3, 0}, {3, 1},
		{5, 0}, {5, 1},
		{4, 0}, // 黑此时形成 0..5 连续 6 子
	}
	for _, m := range moves {
		if _, err := g.Place(m.x, m.y, Empty); err != nil {
			t.Fatalf("unexpected err at %v: %v", m, err)
		}
	}
	if g.State().Status != StatusBlackWin {
		t.Fatalf("expected black win on overline")
	}
}
