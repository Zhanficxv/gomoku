# Arcade Hub · 小游戏中心

一个基于 Go + 原生前端实现的小游戏中心项目，支持：

- 多个小游戏统一注册到主程序
- 每个小游戏使用独立目录组织，方便单独部署
- 大厅首页自动展示所有已注册小游戏
- 支持继续扩展更多小游戏

当前已接入 10 个小游戏：

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

### 账号 / 策略类

#### 五子棋

- 登录 / 注册 / 自动恢复登录态
- 用户专属对局隔离
- 悔棋 / 重置 / 落子记录

路径：

```text
/games/gomoku/
```

#### 井字棋

- 双人同屏轮流落子
- 自动判定胜负与平局
- 支持快速重开

路径：

```text
/games/tictactoe/
```

### 休闲 / 益智类

#### 连连看

- 相同图块在两次转弯内可连通时消除
- 支持重新开始、洗牌、计时、步数

路径：

```text
/games/linkup/
```

#### 2048

- 4x4 数字合成棋盘
- 键盘方向键 / 屏幕按钮控制
- 当前分数、最高分、最大数字、步数

路径：

```text
/games/2048/
```

#### 扫雷

- 左键翻格、右键插旗
- 首步安全
- 自动展开空白区域
- 胜负判定与计时

路径：

```text
/games/minesweeper/
```

#### 记忆翻牌

- 成对翻牌匹配
- 统计步数、匹配数与用时
- 翻错后自动翻回

路径：

```text
/games/memory-match/
```

### 街机 / 动作类

#### 贪吃蛇

- Canvas 实现
- 方向键 / WASD 控制
- 空格暂停 / 继续
- 分数、长度、速度、最高分

路径：

```text
/games/snake/
```

#### 俄罗斯方块

- 方块旋转、移动、硬降
- 消行、等级、分数、最佳成绩
- 下一块预览

路径：

```text
/games/tetris/
```

#### 打砖块

- 挡板反弹小球
- 多层砖块清除
- 生命、分数、关卡推进

路径：

```text
/games/breakout/
```

#### 打地鼠

- 倒计时内快速点击地鼠
- 连击与分数统计
- 节奏逐渐加快

路径：

```text
/games/whack-a-mole/
```

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
        └── whack-a-mole/
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
