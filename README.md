# Gomoku · 五子棋

一个完整的五子棋（Gomoku）小项目，包含：

- **后端**：Go 1.22，使用标准库 `net/http` 提供 RESTful API，支持多对局并发管理。
- **前端**：原生 HTML + CSS + Canvas + JavaScript，无任何前端框架与构建步骤。
- **测试**：游戏核心逻辑与 HTTP API 的单元测试。
- **部署**：单二进制即可运行，前端通过 `embed` 嵌入二进制。

## 功能特性

- 15×15 标准棋盘，黑棋先行
- 五子（含长连）连珠即胜，自动判定平局
- 高亮最后一手与获胜连线
- 鼠标悬停预览落子位置
- 悔棋 / 重置棋盘 / 新对局
- 落子记录列表
- 多对局隔离，每个对局通过唯一 ID 维护
- 登录 / 注册 / 退出登录
- 基于 Cookie 的会话保持，刷新页面后自动恢复登录态
- 用户间对局隔离，每位用户仅能访问自己的游戏
- 响应式布局，移动端友好

## 目录结构

```
.
├── main.go                  # 服务入口（embed 前端静态资源）
├── internal/
│   ├── game/                # 五子棋核心逻辑（无外部依赖）
│   │   ├── game.go
│   │   └── game_test.go
│   └── server/              # HTTP API
│       ├── server.go
│       └── server_test.go
└── web/static/              # 前端静态资源（HTML/CSS/JS）
    ├── index.html
    ├── styles.css
    └── app.js
```

## 快速开始

### 1. 运行（需要 Go 1.22+）

```bash
go run .
```

默认监听 `:8080`，浏览器打开 [http://localhost:8080](http://localhost:8080) 即可进入对战大厅。

### 2. 构建单二进制

```bash
go build -o gomoku .
./gomoku -addr :8080
```

可使用环境变量 `GOMOKU_ADDR` 或 `PORT` 配置监听地址。

### 3. 运行测试

```bash
go test ./...
```

## HTTP API

所有响应均为 JSON。下列示例使用 `curl`。

| 方法 | 路径                          | 说明                               |
| ---- | ----------------------------- | ---------------------------------- |
| POST | `/api/auth/register`          | 注册用户并自动登录                 |
| POST | `/api/auth/login`             | 用户登录                           |
| POST | `/api/auth/logout`            | 退出登录                           |
| GET  | `/api/auth/me`                | 获取当前登录用户                   |
| POST | `/api/games`                  | 创建一局新游戏，返回 ID            |
| GET  | `/api/games/{id}`             | 获取当前对局状态                   |
| POST | `/api/games/{id}/move`        | 落子（自动按当前回合方）           |
| POST | `/api/games/{id}/undo`        | 悔最后一步                         |
| POST | `/api/games/{id}/reset`       | 重置棋盘但保留对局 ID              |
| GET  | `/healthz`                    | 健康检查                           |

> 除 `/api/auth/*` 与 `/healthz` 外，其余接口都需要先登录，并且只能访问当前用户自己的对局。

### 注册

```bash
curl -i -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"测试用户","username":"tester_01","password":"secret123"}'
```

返回示例：

```json
{
  "user": {
    "id": "ab12cd34ef567890",
    "name": "测试用户",
    "username": "tester_01",
    "created_at": "2026-04-19T04:00:00Z"
  }
}
```

注册或登录成功后，服务端会通过 `Set-Cookie` 写入会话 Cookie。

### 登录

```bash
curl -i -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester_01","password":"secret123"}'
```

### 创建对局

```bash
curl -X POST http://localhost:8080/api/games \
  --cookie "gomoku_session=<你的会话 Cookie>"
```

返回：

```json
{
  "id": "ab12cd34ef567890",
  "owner": {
    "id": "ab12cd34ef567890",
    "name": "测试用户",
    "username": "tester_01",
    "created_at": "2026-04-19T04:00:00Z"
  },
  "state": { "board": [...], "turn": 1, "status": "playing", "history": [], "size": 15 }
}
```

### 落子

```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"x":7,"y":7}' \
  --cookie "gomoku_session=<你的会话 Cookie>" \
  http://localhost:8080/api/games/<id>/move
```

字段说明：
- `x`, `y`：坐标，范围 `[0, 14]`
- `stone`（可选）：1 表示黑，2 表示白；省略时使用当前回合方

### 状态字段

- `board`：`15 × 15` 二维数组，0=空 / 1=黑 / 2=白
- `turn`：下一手方（1=黑 / 2=白）
- `status`：`playing` / `black_win` / `white_win` / `draw`
- `winner`：胜者颜色（无则为 0）
- `win_line`：获胜的 5 子坐标列表
- `history`：完整落子序列
- `size`：棋盘尺寸

### 错误响应

错误以 JSON 返回 `{"error": "信息"}`，常见状态码：

- `400`：坐标非法 / 位置已占 / 不该轮到此方 / 没有可悔的棋
- `401`：未登录或登录态失效
- `404`：游戏 ID 不存在
- `409`：游戏已结束

## 技术说明

- 游戏逻辑使用读写锁保护，所有对局可并发访问
- 用户信息与会话默认保存在内存中，适合示例项目与单机部署
- 胜负判定通过四个方向（横、竖、两条对角线）回溯连子数实现
- 前端 Canvas 自适应高 DPI 屏幕（按 `devicePixelRatio` 缩放）
- 静态资源通过 `embed.FS` 打包，部署只需单个二进制

## 许可

本项目以 MIT 许可发布。
