# Arcade Hub · 小游戏合集

一个基于 Go + 原生前端实现的小游戏合集项目，当前包含：

- **五子棋（Gomoku）**：带登录 / 注册 / 会话恢复 / 专属对局隔离的策略对弈小游戏
- **连连看（Link Up）**：纯前端本地游玩的休闲消除小游戏
- **后端**：Go 1.22，使用标准库 `net/http` 提供账号与五子棋 API
- **前端**：原生 HTML + CSS + JavaScript，无框架、无构建步骤
- **部署**：单二进制运行，前端静态资源通过 `embed` 嵌入

## 当前功能

### 游戏大厅

- 根目录为统一小游戏大厅
- 记录最近一次进入的小游戏入口
- 支持继续进入上次游玩的游戏
- 前端目录按子游戏拆分，便于后续继续扩展

### 五子棋

- 15×15 标准棋盘，黑棋先行
- 五子（含长连）连珠即胜，自动判定平局
- 高亮最后一手与获胜连线
- 鼠标悬停预览落子位置
- 悔棋 / 重置棋盘 / 新对局
- 落子记录列表
- 登录 / 注册 / 退出登录
- 基于 Cookie 的会话保持，刷新页面后自动恢复登录态
- 用户间对局隔离，每位用户仅能访问自己的游戏

### 连连看

- 6×6 图块棋盘
- 相同图案且路径拐点不超过两次时可消除
- 支持重新开始与重新洗牌
- 显示剩余图块、已完成配对、步数与计时
- 全部消除后自动通关提示

## 目录结构

```text
.
├── main.go
├── internal/
│   ├── game/                    # 五子棋核心逻辑
│   │   ├── game.go
│   │   └── game_test.go
│   └── server/                  # 认证与五子棋 HTTP API
│       ├── auth.go
│       ├── server.go
│       └── server_test.go
└── web/static/
    ├── index.html               # 小游戏大厅
    ├── styles.css
    ├── app.js
    └── games/
        ├── gomoku/              # 五子棋前端
        │   ├── index.html
        │   ├── styles.css
        │   └── app.js
        └── linkup/              # 连连看前端
            ├── index.html
            ├── styles.css
            └── app.js
```

## 快速开始

### 1. 运行

需要 Go 1.22+：

```bash
go run .
```

默认监听 `:8080`，浏览器打开 [http://localhost:8080](http://localhost:8080) 即可进入小游戏大厅。

### 2. 构建单二进制

```bash
go build -o arcade-hub .
./arcade-hub -addr :8080
```

可使用环境变量 `GOMOKU_ADDR` 或 `PORT` 配置监听地址。

### 3. 运行测试

```bash
go test ./...
```

## 路由说明

### 页面路由

- `/`：小游戏大厅
- `/games/gomoku/`：五子棋
- `/games/linkup/`：连连看

### HTTP API

所有响应均为 JSON。

| 方法 | 路径                   | 说明                       |
| ---- | ---------------------- | -------------------------- |
| POST | `/api/auth/register`   | 注册用户并自动登录         |
| POST | `/api/auth/login`      | 用户登录                   |
| POST | `/api/auth/logout`     | 退出登录                   |
| GET  | `/api/auth/me`         | 获取当前登录用户           |
| POST | `/api/games`           | 创建一局新的五子棋对局     |
| GET  | `/api/games/{id}`      | 获取五子棋对局状态         |
| POST | `/api/games/{id}/move` | 五子棋落子                 |
| POST | `/api/games/{id}/undo` | 五子棋悔最后一步           |
| POST | `/api/games/{id}/reset` | 重置五子棋棋盘            |
| GET  | `/healthz`             | 健康检查                   |

> 除 `/api/auth/*` 与 `/healthz` 外，其余接口都需要先登录，并且只能访问当前用户自己的五子棋对局。

## 技术说明

- 五子棋游戏逻辑使用读写锁保护，所有对局可并发访问
- 用户信息与会话默认保存在内存中，适合示例项目与单机部署
- 连连看为纯前端实现，不依赖后端状态
- 静态资源通过 `embed.FS` 打包，部署只需单个二进制

## 许可

本项目以 MIT 许可发布。
