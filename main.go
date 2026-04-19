// Command gomoku 启动五子棋后端 HTTP 服务，并嵌入静态前端资源。
package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/cursor/gomoku/internal/arcade"
	"github.com/cursor/gomoku/internal/server"
)

//go:embed all:web/static
var staticFS embed.FS

func main() {
	addr := flag.String("addr", defaultAddr(), "HTTP 监听地址")
	flag.Parse()

	sub, err := fs.Sub(staticFS, "web/static")
	if err != nil {
		log.Fatalf("加载静态资源失败: %v", err)
	}

	srv := server.New(sub, arcade.RegisteredGames())
	log.Printf("小游戏中心服务启动于 http://%s", *addr)
	if err := http.ListenAndServe(*addr, srv.Routes()); err != nil {
		log.Fatalf("HTTP 服务异常退出: %v", err)
	}
}

func defaultAddr() string {
	if v := os.Getenv("GOMOKU_ADDR"); v != "" {
		return v
	}
	if v := os.Getenv("PORT"); v != "" {
		return ":" + v
	}
	return ":8080"
}
