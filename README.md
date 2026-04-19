# Arcade Hub · 小游戏中心

一个基于 Go + 原生前端实现的小游戏中心项目，支持：

- 多个小游戏统一注册到主程序
- 每个小游戏使用独立目录组织，方便单独部署
- 大厅首页自动展示所有已注册小游戏
- 持续扩展更多小游戏而不改大厅结构

当前已接入 **16 个小游戏**：

- 五子棋（Gomoku）
- 连连看（Link Up）
- 2048
- 贪吃蛇（Snake）
- 扫雷（Minesweeper）
- 俄罗斯方块（Tetris）
- 井字棋（Tic Tac Toe）
- 记忆翻牌（Memory Match）
- 打砖块（Breakout）
- 打地鼠（Whack-a-Mole）
- 飞机大战（Shooter）
- 数独（Sudoku）
- 黑白棋（Reversi）
- 华容道（Klotski）
- 推箱子（Sokoban）
- 猜单词（Word Guess）

## 核心设计

### 1. 主程序统一注册

主程序通过 `internal/arcade/registry.go` 维护小游戏注册表，每个游戏包含：

- `slug`
- `name`
- `route`
- `standalone_entry`
- `category`
- `mode`
- `badges`
- `features`

大厅通过接口：

```text
GET /api/arcade/games
```

动态获取全部已注册小游戏并自动展示。

### 2. 每个游戏都可独立部署

每个小游戏都放在独立目录：

```text
web/static/games/<slug>/
```

目录内自带：

- `index.html`
- `styles.css`
- `app.js`

因此可以直接把单个目录拷贝出来，作为独立静态站点部署。

### 3. 主程序只负责挂载与展示

- 根路径 `/`：小游戏大厅
- `/games/<slug>/`：小游戏独立入口
- `/api/arcade/games`：注册游戏清单
- 五子棋仍保留认证与对局 API

## 当前游戏列表

### 策略 / 对弈

- 五子棋：登录 / 注册 / 会话恢复 / 专属对局隔离
- 井字棋：本地双人轮流落子、胜负和平局判定
- 黑白棋：翻子策略、本地双人对弈、合法落子提示

### 益智 / 逻辑

- 连连看：两次转弯内连通消除、洗牌、计时、步数
- 2048：数字合成、方向控制、最高分记录
- 扫雷：首步安全、插旗、自动展开空白区域、计时
- 数独：预置谜题、错误高亮、候选逻辑填写
- 华容道：滑块移动、步数统计、完成判定
- 推箱子：箱子推送、目标点覆盖、重开与撤步
- 猜单词：固定长度猜词、字符命中反馈、回合限制
- 记忆翻牌：翻牌配对、步数、计时、完成统计

### 街机 / 反应

- 贪吃蛇：Canvas、加速、暂停、最高分记录
- 俄罗斯方块：旋转、硬降、消行、等级、下一块预览
- 打砖块：挡板反弹、砖块消除、生命系统
- 打地鼠：倒计时、分数、连击与速度提升
- 飞机大战：Canvas 射击、敌机生成、生命与分数系统

## 目录结构

```text
.
├── main.go
├── internal/
│   ├── arcade/
│   │   └── registry.go          # 小游戏注册表
│   ├── game/                    # 五子棋核心逻辑
│   │   ├── game.go
│   │   └── game_test.go
│   └── server/                  # HTTP 服务与认证 / 五子棋 API
│       ├── auth.go
│       ├── server.go
│       └── server_test.go
└── web/static/
    ├── index.html               # 大厅入口
    ├── styles.css
    ├── app.js
    └── games/
        ├── gomoku/
        ├── linkup/
        ├── 2048/
        ├── snake/
        ├── minesweeper/
        ├── tetris/
        ├── tictactoe/
        ├── memory-match/
        ├── breakout/
        ├── whack-a-mole/
        ├── shooter/
        ├── sudoku/
        ├── reversi/
        ├── klotski/
        ├── sokoban/
        └── word-guess/
```

## 快速开始

### 1. 运行

需要 Go 1.22+：

```bash
go run .
```

默认监听 `:8080`，浏览器打开：

```text
http://localhost:8080
```

### 2. 构建

```bash
go build -o arcade-hub .
./arcade-hub -addr :8080
```

### 3. 测试

```bash
go test ./...
```

## 后端接口

### 大厅注册信息

| 方法 | 路径                | 说明                 |
| ---- | ------------------- | -------------------- |
| GET  | `/api/arcade/games` | 获取全部已注册小游戏 |

### 认证接口

| 方法 | 路径                 | 说明               |
| ---- | -------------------- | ------------------ |
| POST | `/api/auth/register` | 注册用户并自动登录 |
| POST | `/api/auth/login`    | 用户登录           |
| POST | `/api/auth/logout`   | 退出登录           |
| GET  | `/api/auth/me`       | 获取当前登录用户   |

### 五子棋接口

| 方法 | 路径                   | 说明                   |
| ---- | ---------------------- | ---------------------- |
| POST | `/api/games`           | 创建一局新的五子棋对局 |
| GET  | `/api/games/{id}`      | 获取五子棋对局状态     |
| POST | `/api/games/{id}/move` | 五子棋落子             |
| POST | `/api/games/{id}/undo` | 五子棋悔最后一步       |
| POST | `/api/games/{id}/reset`| 重置五子棋棋盘         |

> 五子棋 API 需要先登录，并且只能访问当前用户自己的对局。

## 如何继续扩展新游戏

新增一个小游戏时，按下面步骤即可：

1. 新建目录：

```text
web/static/games/<new-slug>/
```

2. 放入：

- `index.html`
- `styles.css`
- `app.js`

3. 在 `internal/arcade/registry.go` 中增加一条注册记录

4. 启动主程序后，该游戏会自动出现在大厅首页

## 许可

本项目以 MIT 许可发布。
