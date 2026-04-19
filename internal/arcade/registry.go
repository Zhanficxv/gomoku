package arcade

// Game 描述一个已注册到主程序中的小游戏。
// 每个游戏都拥有独立入口目录，可单独作为静态站点部署。
type Game struct {
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	Tagline         string   `json:"tagline"`
	Description     string   `json:"description"`
	Category        string   `json:"category"`
	Mode            string   `json:"mode"`
	Icon            string   `json:"icon"`
	Route           string   `json:"route"`
	StandaloneEntry string   `json:"standalone_entry"`
	AuthRequired    bool     `json:"auth_required"`
	Featured        bool     `json:"featured"`
	Badges          []string `json:"badges"`
	Features        []string `json:"features"`
}

// RegisteredGames 返回当前已注册到主程序的小游戏列表。
func RegisteredGames() []Game {
	return []Game{
		{
			Slug:            "gomoku",
			Name:            "五子棋",
			Tagline:         "登录后进入专属对局，黑白对弈，五子连珠者胜。",
			Description:     "带注册、登录、会话恢复与专属对局隔离的策略对弈小游戏。",
			Category:        "策略对弈",
			Mode:            "账号玩法",
			Icon:            "●○",
			Route:           "/games/gomoku/",
			StandaloneEntry: "web/static/games/gomoku/",
			AuthRequired:    true,
			Featured:        true,
			Badges:          []string{"账号系统", "Canvas 棋盘"},
			Features:        []string{"登录 / 注册", "专属对局", "悔棋 / 重置", "落子记录"},
		},
		{
			Slug:            "linkup",
			Name:            "连连看",
			Tagline:         "相同图块在两次转弯内可连通时即可消除。",
			Description:     "纯前端休闲益智小游戏，支持洗牌、计时与步数统计。",
			Category:        "休闲益智",
			Mode:            "单机玩法",
			Icon:            "🍒",
			Route:           "/games/linkup/",
			StandaloneEntry: "web/static/games/linkup/",
			AuthRequired:    false,
			Featured:        true,
			Badges:          []string{"连线消除", "单机"},
			Features:        []string{"两次转弯连通", "重新开始", "重新洗牌", "计时 / 步数"},
		},
		{
			Slug:            "2048",
			Name:            "2048",
			Tagline:         "合并数字方块，挑战更高分数与更大数字。",
			Description:     "经典数字合成小游戏，支持键盘操作、分数统计与本地最高分。",
			Category:        "数字益智",
			Mode:            "单机玩法",
			Icon:            "2048",
			Route:           "/games/2048/",
			StandaloneEntry: "web/static/games/2048/",
			AuthRequired:    false,
			Featured:        true,
			Badges:          []string{"数字合成", "键盘操作"},
			Features:        []string{"4x4 棋盘", "方向移动", "分数统计", "最高分记录"},
		},
		{
			Slug:            "snake",
			Name:            "贪吃蛇",
			Tagline:         "控制小蛇吃到食物，不断变长并刷新最高分。",
			Description:     "经典街机小游戏，支持暂停、重新开始和本地最佳成绩记录。",
			Category:        "街机动作",
			Mode:            "单机玩法",
			Icon:            "🐍",
			Route:           "/games/snake/",
			StandaloneEntry: "web/static/games/snake/",
			AuthRequired:    false,
			Featured:        true,
			Badges:          []string{"街机", "Canvas"},
			Features:        []string{"方向控制", "暂停 / 重开", "分数统计", "逐步加速"},
		},
		{
			Slug:            "minesweeper",
			Name:            "扫雷",
			Tagline:         "标记地雷、推断安全格，清空雷区即可获胜。",
			Description:     "原生前端实现的经典扫雷，支持插旗、展开空白区域与胜负判定。",
			Category:        "策略益智",
			Mode:            "单机玩法",
			Icon:            "💣",
			Route:           "/games/minesweeper/",
			StandaloneEntry: "web/static/games/minesweeper/",
			AuthRequired:    false,
			Featured:        true,
			Badges:          []string{"逻辑推理", "经典玩法"},
			Features:        []string{"左键翻开", "右键插旗", "自动展开空白", "计时统计"},
		},
		{
			Slug:            "tetris",
			Name:            "俄罗斯方块",
			Tagline:         "旋转并堆叠方块，消行得分，随着等级提升加快下落速度。",
			Description:     "经典方块消除玩法，支持旋转、硬降、等级与分数系统。",
			Category:        "街机动作",
			Mode:            "单机玩法",
			Icon:            "🧱",
			Route:           "/games/tetris/",
			StandaloneEntry: "web/static/games/tetris/",
			AuthRequired:    false,
			Featured:        true,
			Badges:          []string{"方块消除", "Canvas"},
			Features:        []string{"旋转 / 移动", "硬降", "分数 / 等级", "消行统计"},
		},
	}
}
