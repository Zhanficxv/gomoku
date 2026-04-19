# Gomoku · 五子棋

一个完整可玩的五子棋项目，支持三种模式：

- **本地双人**：同一台设备轮流落子。
- **人机对战**：内置 AI 引擎，可选 **简单 / 中等 / 困难** 三档难度。
- **联机对战**：基于 WebSocket 的房间制实时对战，支持观战与房间链接分享。

技术栈：Go 1.22 + 标准库 `net/http` + `gorilla/websocket`，前端为原生 HTML / CSS / Canvas / JS，无需任何构建工具。前端通过 `embed` 嵌入二进制，最终单文件即可部署。

## 功能特性

- 15×15 标准棋盘，黑棋先行；五连即胜（含长连），自动判定平局
- 高亮最后一手与获胜连线，鼠标悬停半透明预览落子位置
- 三种模式 + 三档 AI 难度，可在前端面板自由切换
- 联机对战：自动分配黑/白角色，多余客户端进入观战；支持悔棋 / 重置广播
- 房间链接 (`?room=xxxxxx`) 一键分享给好友直接加入
- 落子记录、当前回合、玩家在线状态实时同步
- 响应式布局，移动端可用

## 目录结构

```
.
├── main.go                  # 服务入口（embed 嵌入前端）
├── internal/
│   ├── game/                # 五子棋核心规则与状态机
│   ├── ai/                  # AI 引擎（启发式 + Alpha-Beta）
│   ├── room/                # 房间 / Hub（用于 WS 多房间管理）
│   └── server/              # HTTP + WebSocket 接口
└── web/static/              # 前端：index.html / styles.css / app.js
```

## 快速开始

需要 Go 1.22+。

```bash
go run .
# 浏览器访问 http://localhost:8080
```

或构建单二进制：

```bash
go build -o gomoku .
./gomoku -addr :8080
```

支持 `GOMOKU_ADDR` 与 `PORT` 环境变量。

## 运行测试

```bash
go test ./...
```

测试覆盖范围：游戏规则、四方向胜负判定、悔棋/重置、AI 三档难度行为、房间状态机、WebSocket 端到端流程。

## 三种对局模式

### 1. 本地双人

同一台设备共用棋盘，使用经典的 REST API：

| 方法 | 路径                          | 说明                    |
| ---- | ----------------------------- | ----------------------- |
| POST | `/api/games`                  | 创建本地对局            |
| GET  | `/api/games/{id}`             | 查询当前状态            |
| POST | `/api/games/{id}/move`        | 落子                    |
| POST | `/api/games/{id}/undo`        | 悔最后一步              |
| POST | `/api/games/{id}/reset`       | 重置棋盘                |

### 2. 人机对战 / 3. 联机对战

通过房间 + WebSocket 实现。

| 方法 | 路径                | 说明                                                     |
| ---- | ------------------- | -------------------------------------------------------- |
| POST | `/api/rooms`        | 创建房间。Body: `{"mode":"ai","difficulty":"hard"}`，或 `{"mode":"pvp"}` |
| GET  | `/api/rooms`        | 列出所有房间                                             |
| GET  | `/api/rooms/{id}`   | 获取房间快照                                             |
| WS   | `/ws/rooms/{id}?role=auto|black|white|spectator` | 加入房间并实时通信 |

#### WebSocket 协议

客户端 → 服务端（文本 JSON 帧）：

```json
{ "type": "move", "x": 7, "y": 7 }
{ "type": "undo" }
{ "type": "reset" }
{ "type": "state" }
```

服务端 → 客户端：

```json
{ "type": "state", "data": { "room": {...}, "game": {...}, "you": {"role":"black","client_id":"..."} } }
{ "type": "error", "data": { "message": "还没轮到你" } }
```

`game` 字段与本地模式 `state` 完全一致：

- `board`：`15 × 15`，0=空 / 1=黑 / 2=白
- `turn`、`status`、`winner`、`win_line`、`history`、`size`

#### 角色分配规则

- **PvP**：第一个连接者拿到黑棋，第二个拿到白棋；后续连接者进入观战；可通过 `?role=` 参数指定期望角色。
- **AI**：第一位人类玩家加入时确定颜色（默认黑棋先手；可通过 `?role=white` 让 AI 执黑先手），AI 自动占据另一方。
- 中途断开：座位会被释放，下次有人加入将自动顶上。

## AI 难度说明

AI 引擎位于 `internal/ai`，对外仅暴露 `Engine.Choose(snapshot, color, difficulty)`。三档实现：

| 难度    | 策略                                                                 |
| ------- | -------------------------------------------------------------------- |
| `easy`   | 邻域随机，但优先吃掉立即获胜或必须堵的点                              |
| `medium` | 启发式贪心：枚举候选点，按"攻 + 守"的形态评分（活四 / 冲四 / 活三 …）选最优 |
| `hard`   | 在 medium 评估之上对前 8 个候选做 **2 层 Alpha-Beta 搜索**，并对候选裁剪    |

评估函数对每条线段按 5 / 活四 / 冲四 / 活三 / 眠三 / 活二 / 眠二 / 活一 等模式打分，并加入中心偏置。算法是无禁手版本，长连同样视为胜负。

## 房间分享

人机或联机房间创建后，前端"房间"行有"复制"按钮，可复制类似 `https://your-host/?room=abc123` 的链接。其他人打开该链接将自动以联机模式加入。

## 部署

由于前端通过 `//go:embed all:web/static` 打包进二进制，部署只需运行单二进制：

```bash
GOOS=linux GOARCH=amd64 go build -o gomoku .
scp gomoku user@host:/srv/gomoku/
ssh user@host /srv/gomoku/gomoku -addr :80
```

### 通过 Nginx 反向代理（推荐生产）

`deploy/nginx/` 下提供了开箱即用的两份 Nginx 配置：

- `gomoku.conf` —— HTTPS + HTTP 跳转 + HSTS + gzip + 静态资源缓存（生产推荐）
- `gomoku-http.conf` —— 纯 HTTP，适合内网 / 容器 / 上游已 TLS 终止

两份都正确处理了 WebSocket 升级，使 `/ws/rooms/{id}` 长连接能稳定工作。详细使用方法见 [`deploy/nginx/README.md`](deploy/nginx/README.md)。

最简流程：

```bash
./gomoku -addr 127.0.0.1:8080 &
sudo cp deploy/nginx/gomoku-http.conf /etc/nginx/conf.d/gomoku.conf
sudo nginx -t && sudo systemctl reload nginx
```

## 许可

MIT License.
