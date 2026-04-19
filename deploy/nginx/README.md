# Nginx 反向代理配置

本目录提供两份开箱即用的 Nginx 配置，将外部 80 / 443 流量代理到本机的 Gomoku Go 二进制（默认监听 `127.0.0.1:8080`）。两份配置都正确处理了 WebSocket 升级，所以 `/ws/rooms/{id}` 长连接可以稳定工作。

## 文件说明

| 文件 | 适用场景 |
| --- | --- |
| `gomoku.conf` | **推荐生产部署**：HTTP→HTTPS 强制跳转、TLS 终止、HSTS、安全响应头、gzip、静态资源缓存 |
| `gomoku-http.conf` | 仅 HTTP，用于内网 / 容器 / 开发环境，或者上游已有 TLS 终止器（如 Cloud Load Balancer / ingress）的场景 |

## 部署步骤

### 1. 启动 Go 服务并仅监听本地

```bash
./gomoku -addr 127.0.0.1:8080
# 或
GOMOKU_ADDR=127.0.0.1:8080 ./gomoku
```

可以使用 systemd 让其常驻；下方给出一个最小示例：

```ini
# /etc/systemd/system/gomoku.service
[Unit]
Description=Gomoku game server
After=network.target

[Service]
ExecStart=/srv/gomoku/gomoku -addr 127.0.0.1:8080
Restart=always
RestartSec=2
User=gomoku
WorkingDirectory=/srv/gomoku

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gomoku
```

### 2. 选择并复制 Nginx 配置

**HTTPS 生产**（推荐）：

```bash
sudo cp deploy/nginx/gomoku.conf /etc/nginx/conf.d/gomoku.conf
# 或者放到 sites-available/ 再 ln -s 到 sites-enabled/
sudo nano /etc/nginx/conf.d/gomoku.conf   # 改 server_name + 证书路径
sudo nginx -t
sudo systemctl reload nginx
```

**纯 HTTP**：

```bash
sudo cp deploy/nginx/gomoku-http.conf /etc/nginx/conf.d/gomoku.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 申请 TLS 证书（仅 HTTPS 配置需要）

`gomoku.conf` 已预留 ACME http-01 验证目录 `/.well-known/acme-challenge/`。下面以 Certbot 为例：

```bash
sudo apt install certbot
sudo mkdir -p /var/www/letsencrypt
sudo certbot certonly --webroot -w /var/www/letsencrypt \
    -d gomoku.example.com \
    --email you@example.com --agree-tos --no-eff-email
sudo systemctl reload nginx
```

后续 Certbot 自动续期任务会自动复用同一目录。

## 关键设计点

- `map $http_upgrade $gomoku_connection_upgrade` 在 `/ws/` 下把 `Connection: upgrade` 正确传到上游，保证 WebSocket 握手成功。
- `/ws/` 路径关闭了 `proxy_buffering` 与 `proxy_request_buffering`，并把读写超时拉到 `1h`，避免长连接被中断。
- `/api/` 与根路径走普通短连接代理，并复用 `keepalive 32` 上游连接池。
- 静态资源（`*.css/*.js/*.png/...`）加了 `expires 1h`，浏览器命中后无需回源；如需强缓存可改成 `1y` 配合内容哈希文件名。
- HTTPS 配置默认开启 HSTS，**请确认证书已签发并续期工作正常再开启**，避免误封自己。

## 验证

启动后任选下列方式：

```bash
# 健康检查
curl -sS https://gomoku.example.com/healthz

# 创建一个本地房间
curl -sS -X POST -H 'Content-Type: application/json' \
     -d '{"mode":"ai","difficulty":"medium"}' \
     https://gomoku.example.com/api/rooms

# 用 websocat 测试 WebSocket
websocat wss://gomoku.example.com/ws/rooms/<room_id>?role=black
```

浏览器访问 `https://gomoku.example.com/`，进入对局后打开 DevTools → Network → WS，应该能看到 `/ws/rooms/...` 长连接处于 `101 Switching Protocols` 状态。
