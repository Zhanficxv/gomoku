// Package ai 提供五子棋的人机算法，含三档难度：
//
//	easy   - 邻域随机 + 简单评估
//	medium - 启发式贪心（攻防综合打分）
//	hard   - 受限候选 + Alpha-Beta 浅层搜索
package ai

import (
	"errors"
	"math"
	"math/rand"
	"sort"
	"time"

	"github.com/cursor/gomoku/internal/game"
)

// Difficulty 表示 AI 难度等级。
type Difficulty string

const (
	Easy   Difficulty = "easy"
	Medium Difficulty = "medium"
	Hard   Difficulty = "hard"
)

// ParseDifficulty 解析难度字符串，未知输入返回 Medium。
func ParseDifficulty(s string) Difficulty {
	switch Difficulty(s) {
	case Easy, Medium, Hard:
		return Difficulty(s)
	default:
		return Medium
	}
}

// Engine 是一个无状态的 AI 引擎，可被多个 goroutine 共享。
type Engine struct {
	rng *rand.Rand
}

// New 构造一个引擎，使用本地随机源。
func New() *Engine {
	return &Engine{rng: rand.New(rand.NewSource(time.Now().UnixNano()))}
}

// ErrNoMove 表示棋盘没有可下的位置（极少见，仅在棋盘下满时出现）。
var ErrNoMove = errors.New("ai: 没有可用的落子位置")

// Choose 根据难度为 self 颜色选择一手。
// snap 是当前游戏快照，self 是 AI 自己的颜色。
func (e *Engine) Choose(snap game.Snapshot, self game.Stone, diff Difficulty) (game.Move, error) {
	if self != game.Black && self != game.White {
		return game.Move{}, errors.New("ai: 非法颜色")
	}
	board := snap.Board

	if isEmpty(board) {
		// 第一手优先落天元
		c := game.BoardSize / 2
		return game.Move{X: c, Y: c, Stone: self}, nil
	}

	candidates := candidateMoves(board, 2)
	if len(candidates) == 0 {
		return game.Move{}, ErrNoMove
	}

	switch diff {
	case Easy:
		return e.chooseEasy(board, candidates, self), nil
	case Hard:
		return e.chooseHard(board, candidates, self), nil
	default:
		return e.chooseGreedy(board, candidates, self), nil
	}
}

// ------- 难度实现 -------

func (e *Engine) chooseEasy(board boardT, cands []game.Move, self game.Stone) game.Move {
	// 简单：先看是否能立刻赢；其次堵对手立即赢；否则随机挑邻居
	opp := opposite(self)
	if m, ok := findImmediateWin(board, cands, self); ok {
		return m
	}
	if m, ok := findImmediateWin(board, cands, opp); ok {
		m.Stone = self
		return m
	}
	pick := cands[e.rng.Intn(len(cands))]
	pick.Stone = self
	return pick
}

func (e *Engine) chooseGreedy(board boardT, cands []game.Move, self game.Stone) game.Move {
	opp := opposite(self)
	if m, ok := findImmediateWin(board, cands, self); ok {
		return m
	}
	if m, ok := findImmediateWin(board, cands, opp); ok {
		m.Stone = self
		return m
	}
	best := cands[0]
	bestScore := math.Inf(-1)
	for _, c := range cands {
		s := scoreMove(board, c.X, c.Y, self)
		if s > bestScore {
			bestScore = s
			best = c
		}
	}
	best.Stone = self
	return best
}

func (e *Engine) chooseHard(board boardT, cands []game.Move, self game.Stone) game.Move {
	opp := opposite(self)
	if m, ok := findImmediateWin(board, cands, self); ok {
		return m
	}
	if m, ok := findImmediateWin(board, cands, opp); ok {
		m.Stone = self
		return m
	}

	type scored struct {
		move  game.Move
		score float64
	}
	prelim := make([]scored, 0, len(cands))
	for _, c := range cands {
		prelim = append(prelim, scored{c, scoreMove(board, c.X, c.Y, self)})
	}
	sort.Slice(prelim, func(i, j int) bool { return prelim[i].score > prelim[j].score })
	const topN = 8
	if len(prelim) > topN {
		prelim = prelim[:topN]
	}

	best := prelim[0].move
	bestVal := math.Inf(-1)
	for _, s := range prelim {
		board[s.move.Y][s.move.X] = self
		val := alphaBeta(board, 2, math.Inf(-1), math.Inf(1), false, self, opp)
		board[s.move.Y][s.move.X] = game.Empty
		if val > bestVal {
			bestVal = val
			best = s.move
		}
	}
	best.Stone = self
	return best
}

// alphaBeta：minimax with α-β，maximizing 表示当前是 self 走。
func alphaBeta(board boardT, depth int, alpha, beta float64, maximizing bool, self, opp game.Stone) float64 {
	if depth == 0 {
		return evaluateBoard(board, self) - evaluateBoard(board, opp)*1.05
	}
	cands := candidateMoves(board, 1)
	if len(cands) == 0 {
		return evaluateBoard(board, self) - evaluateBoard(board, opp)*1.05
	}

	type scored struct {
		move  game.Move
		score float64
	}
	prelim := make([]scored, 0, len(cands))
	color := self
	if !maximizing {
		color = opp
	}
	for _, c := range cands {
		prelim = append(prelim, scored{c, scoreMove(board, c.X, c.Y, color)})
	}
	sort.Slice(prelim, func(i, j int) bool { return prelim[i].score > prelim[j].score })
	const topN = 6
	if len(prelim) > topN {
		prelim = prelim[:topN]
	}

	if maximizing {
		v := math.Inf(-1)
		for _, s := range prelim {
			board[s.move.Y][s.move.X] = self
			if hasFiveAt(board, s.move.X, s.move.Y, self) {
				board[s.move.Y][s.move.X] = game.Empty
				return scoreFive
			}
			val := alphaBeta(board, depth-1, alpha, beta, false, self, opp)
			board[s.move.Y][s.move.X] = game.Empty
			if val > v {
				v = val
			}
			if v > alpha {
				alpha = v
			}
			if alpha >= beta {
				break
			}
		}
		return v
	}
	v := math.Inf(1)
	for _, s := range prelim {
		board[s.move.Y][s.move.X] = opp
		if hasFiveAt(board, s.move.X, s.move.Y, opp) {
			board[s.move.Y][s.move.X] = game.Empty
			return -scoreFive
		}
		val := alphaBeta(board, depth-1, alpha, beta, true, self, opp)
		board[s.move.Y][s.move.X] = game.Empty
		if val < v {
			v = val
		}
		if v < beta {
			beta = v
		}
		if alpha >= beta {
			break
		}
	}
	return v
}

// ------- 评估与候选 -------

type boardT = [game.BoardSize][game.BoardSize]game.Stone

const (
	scoreFive        = 1_000_000.0
	scoreOpenFour    = 100_000.0
	scoreClosedFour  = 10_000.0
	scoreOpenThree   = 5_000.0
	scoreClosedThree = 500.0
	scoreOpenTwo     = 200.0
	scoreClosedTwo   = 30.0
	scoreOpenOne     = 5.0
)

// scoreMove 估算在 (x,y) 为 color 落子的综合价值（攻防加权）。
func scoreMove(board boardT, x, y int, color game.Stone) float64 {
	opp := opposite(color)
	board[y][x] = color
	attack := evaluateAround(board, x, y, color)
	board[y][x] = opp
	defense := evaluateAround(board, x, y, opp)
	board[y][x] = game.Empty

	// 中心偏置：靠近中心稍微加分，避免 AI 总在角落挣扎
	cx, cy := game.BoardSize/2, game.BoardSize/2
	dist := math.Abs(float64(x-cx)) + math.Abs(float64(y-cy))
	centerBonus := math.Max(0, 8-dist)

	return attack*1.05 + defense + centerBonus
}

// evaluateAround 仅评估 (x,y) 所在 4 个方向上的线段贡献，比全盘扫描快。
func evaluateAround(board boardT, x, y int, color game.Stone) float64 {
	dirs := [4][2]int{{1, 0}, {0, 1}, {1, 1}, {1, -1}}
	total := 0.0
	for _, d := range dirs {
		total += scoreLine(board, x, y, d[0], d[1], color)
	}
	return total
}

// scoreLine 评估穿过 (x, y)、方向 (dx, dy) 的连子情况。
func scoreLine(board boardT, x, y, dx, dy int, color game.Stone) float64 {
	if board[y][x] != color {
		return 0
	}
	// 起点：沿反方向回溯到一段连子的端点
	sx, sy := x, y
	for {
		nx, ny := sx-dx, sy-dy
		if !inBoard(nx, ny) || board[ny][nx] != color {
			break
		}
		sx, sy = nx, ny
	}
	// 计算连子长度
	cnt := 0
	cx, cy := sx, sy
	for inBoard(cx, cy) && board[cy][cx] == color {
		cnt++
		cx += dx
		cy += dy
	}
	// 两端是否开放
	leftX, leftY := sx-dx, sy-dy
	rightX, rightY := cx, cy
	leftOpen := inBoard(leftX, leftY) && board[leftY][leftX] == game.Empty
	rightOpen := inBoard(rightX, rightY) && board[rightY][rightX] == game.Empty
	openSides := 0
	if leftOpen {
		openSides++
	}
	if rightOpen {
		openSides++
	}

	switch {
	case cnt >= 5:
		return scoreFive
	case cnt == 4 && openSides == 2:
		return scoreOpenFour
	case cnt == 4 && openSides == 1:
		return scoreClosedFour
	case cnt == 3 && openSides == 2:
		return scoreOpenThree
	case cnt == 3 && openSides == 1:
		return scoreClosedThree
	case cnt == 2 && openSides == 2:
		return scoreOpenTwo
	case cnt == 2 && openSides == 1:
		return scoreClosedTwo
	case cnt == 1 && openSides == 2:
		return scoreOpenOne
	}
	return 0
}

// evaluateBoard 估算整盘对 color 的总价值。
func evaluateBoard(board boardT, color game.Stone) float64 {
	total := 0.0
	for y := 0; y < game.BoardSize; y++ {
		for x := 0; x < game.BoardSize; x++ {
			if board[y][x] != color {
				continue
			}
			// 仅在每条线段的起点（前一格不是同色）累加，避免重复
			dirs := [4][2]int{{1, 0}, {0, 1}, {1, 1}, {1, -1}}
			for _, d := range dirs {
				px, py := x-d[0], y-d[1]
				if inBoard(px, py) && board[py][px] == color {
					continue
				}
				total += scoreLine(board, x, y, d[0], d[1], color)
			}
		}
	}
	return total
}

// candidateMoves 返回所有距离已有棋子不超过 dist 的空位。
func candidateMoves(board boardT, dist int) []game.Move {
	if isEmpty(board) {
		c := game.BoardSize / 2
		return []game.Move{{X: c, Y: c}}
	}
	var moves []game.Move
	visited := [game.BoardSize][game.BoardSize]bool{}
	for y := 0; y < game.BoardSize; y++ {
		for x := 0; x < game.BoardSize; x++ {
			if board[y][x] == game.Empty {
				continue
			}
			for dy := -dist; dy <= dist; dy++ {
				for dx := -dist; dx <= dist; dx++ {
					nx, ny := x+dx, y+dy
					if !inBoard(nx, ny) || visited[ny][nx] {
						continue
					}
					if board[ny][nx] == game.Empty {
						visited[ny][nx] = true
						moves = append(moves, game.Move{X: nx, Y: ny})
					}
				}
			}
		}
	}
	return moves
}

func findImmediateWin(board boardT, cands []game.Move, color game.Stone) (game.Move, bool) {
	for _, c := range cands {
		board[c.Y][c.X] = color
		win := hasFiveAt(board, c.X, c.Y, color)
		board[c.Y][c.X] = game.Empty
		if win {
			c.Stone = color
			return c, true
		}
	}
	return game.Move{}, false
}

func hasFiveAt(board boardT, x, y int, color game.Stone) bool {
	dirs := [4][2]int{{1, 0}, {0, 1}, {1, 1}, {1, -1}}
	for _, d := range dirs {
		dx, dy := d[0], d[1]
		count := 1
		nx, ny := x+dx, y+dy
		for inBoard(nx, ny) && board[ny][nx] == color {
			count++
			nx += dx
			ny += dy
		}
		nx, ny = x-dx, y-dy
		for inBoard(nx, ny) && board[ny][nx] == color {
			count++
			nx -= dx
			ny -= dy
		}
		if count >= 5 {
			return true
		}
	}
	return false
}

func isEmpty(board boardT) bool {
	for y := 0; y < game.BoardSize; y++ {
		for x := 0; x < game.BoardSize; x++ {
			if board[y][x] != game.Empty {
				return false
			}
		}
	}
	return true
}

func inBoard(x, y int) bool {
	return x >= 0 && x < game.BoardSize && y >= 0 && y < game.BoardSize
}

func opposite(s game.Stone) game.Stone {
	if s == game.Black {
		return game.White
	}
	return game.Black
}
