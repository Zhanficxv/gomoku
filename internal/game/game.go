// Package game 实现了五子棋的核心规则与状态管理。
package game

import (
	"errors"
	"sync"
)

// BoardSize 是棋盘的标准尺寸（15x15）。
const BoardSize = 15

// Stone 表示棋子的颜色，0 表示空。
type Stone int

const (
	Empty Stone = 0
	Black Stone = 1
	White Stone = 2
)

// Status 表示一局游戏的状态。
type Status string

const (
	StatusPlaying  Status = "playing"
	StatusBlackWin Status = "black_win"
	StatusWhiteWin Status = "white_win"
	StatusDraw     Status = "draw"
)

// Move 表示一次落子。
type Move struct {
	X     int   `json:"x"`
	Y     int   `json:"y"`
	Stone Stone `json:"stone"`
}

// Game 表示一局五子棋的完整状态，方法均为协程安全。
type Game struct {
	mu      sync.RWMutex
	board   [BoardSize][BoardSize]Stone
	turn    Stone
	status  Status
	winner  Stone
	winLine []Move
	history []Move
}

// New 创建一局新游戏，黑棋先行。
func New() *Game {
	return &Game{
		turn:   Black,
		status: StatusPlaying,
	}
}

// Snapshot 是游戏当前可序列化的状态视图。
type Snapshot struct {
	Board   [BoardSize][BoardSize]Stone `json:"board"`
	Turn    Stone                       `json:"turn"`
	Status  Status                      `json:"status"`
	Winner  Stone                       `json:"winner"`
	WinLine []Move                      `json:"win_line,omitempty"`
	History []Move                      `json:"history"`
	Size    int                         `json:"size"`
}

// State 返回当前游戏状态的快照。
func (g *Game) State() Snapshot {
	g.mu.RLock()
	defer g.mu.RUnlock()
	historyCopy := make([]Move, len(g.history))
	copy(historyCopy, g.history)
	winLineCopy := make([]Move, len(g.winLine))
	copy(winLineCopy, g.winLine)
	return Snapshot{
		Board:   g.board,
		Turn:    g.turn,
		Status:  g.status,
		Winner:  g.winner,
		WinLine: winLineCopy,
		History: historyCopy,
		Size:    BoardSize,
	}
}

// 常见错误。
var (
	ErrOutOfBoard   = errors.New("坐标超出棋盘范围")
	ErrCellOccupied = errors.New("该位置已经有棋子")
	ErrGameOver     = errors.New("游戏已经结束")
	ErrWrongTurn    = errors.New("不是该方的回合")
	ErrNoMoveToUndo = errors.New("没有可悔的棋")
)

// Place 在 (x, y) 处为指定颜色落子。如果传入的 stone 是 Empty，
// 则使用当前回合方落子。
func (g *Game) Place(x, y int, stone Stone) (Snapshot, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != StatusPlaying {
		return g.snapshotLocked(), ErrGameOver
	}
	if x < 0 || x >= BoardSize || y < 0 || y >= BoardSize {
		return g.snapshotLocked(), ErrOutOfBoard
	}
	if stone == Empty {
		stone = g.turn
	}
	if stone != g.turn {
		return g.snapshotLocked(), ErrWrongTurn
	}
	if g.board[y][x] != Empty {
		return g.snapshotLocked(), ErrCellOccupied
	}

	g.board[y][x] = stone
	g.history = append(g.history, Move{X: x, Y: y, Stone: stone})

	if line, ok := g.checkWinAt(x, y, stone); ok {
		g.status = winStatusFor(stone)
		g.winner = stone
		g.winLine = line
	} else if len(g.history) == BoardSize*BoardSize {
		g.status = StatusDraw
	} else {
		g.turn = opposite(stone)
	}

	return g.snapshotLocked(), nil
}

// Undo 悔掉最后一步。
func (g *Game) Undo() (Snapshot, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if len(g.history) == 0 {
		return g.snapshotLocked(), ErrNoMoveToUndo
	}
	last := g.history[len(g.history)-1]
	g.history = g.history[:len(g.history)-1]
	g.board[last.Y][last.X] = Empty
	g.status = StatusPlaying
	g.winner = Empty
	g.winLine = nil
	g.turn = last.Stone
	return g.snapshotLocked(), nil
}

// Reset 重置游戏到初始状态。
func (g *Game) Reset() Snapshot {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.board = [BoardSize][BoardSize]Stone{}
	g.turn = Black
	g.status = StatusPlaying
	g.winner = Empty
	g.winLine = nil
	g.history = g.history[:0]
	return g.snapshotLocked()
}

func (g *Game) snapshotLocked() Snapshot {
	historyCopy := make([]Move, len(g.history))
	copy(historyCopy, g.history)
	winLineCopy := make([]Move, len(g.winLine))
	copy(winLineCopy, g.winLine)
	return Snapshot{
		Board:   g.board,
		Turn:    g.turn,
		Status:  g.status,
		Winner:  g.winner,
		WinLine: winLineCopy,
		History: historyCopy,
		Size:    BoardSize,
	}
}

func opposite(s Stone) Stone {
	if s == Black {
		return White
	}
	return Black
}

func winStatusFor(s Stone) Status {
	if s == Black {
		return StatusBlackWin
	}
	return StatusWhiteWin
}

// checkWinAt 检查在 (x, y) 处放下 stone 后是否形成五连。
// 若形成，返回构成五连的 5 个棋子坐标。
func (g *Game) checkWinAt(x, y int, stone Stone) ([]Move, bool) {
	dirs := [4][2]int{
		{1, 0},  // 横
		{0, 1},  // 竖
		{1, 1},  // 主对角
		{1, -1}, // 副对角
	}
	for _, d := range dirs {
		dx, dy := d[0], d[1]
		count := 1
		// 正方向
		nx, ny := x+dx, y+dy
		for inBoard(nx, ny) && g.board[ny][nx] == stone {
			count++
			nx += dx
			ny += dy
		}
		// 反方向
		px, py := x-dx, y-dy
		for inBoard(px, py) && g.board[py][px] == stone {
			count++
			px -= dx
			py -= dy
		}
		if count >= 5 {
			// 收集恰好 5 个连子，从最远的反方向起点开始
			startX, startY := x-dx, y-dy
			for inBoard(startX, startY) && g.board[startY][startX] == stone {
				startX -= dx
				startY -= dy
			}
			startX += dx
			startY += dy
			line := make([]Move, 0, count)
			cx, cy := startX, startY
			for inBoard(cx, cy) && g.board[cy][cx] == stone {
				line = append(line, Move{X: cx, Y: cy, Stone: stone})
				cx += dx
				cy += dy
			}
			return line, true
		}
	}
	return nil, false
}

func inBoard(x, y int) bool {
	return x >= 0 && x < BoardSize && y >= 0 && y < BoardSize
}
