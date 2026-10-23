// Шлюз для spec.biy.kz: одна дверь, за ней две программы.
//
//	/              — страница выбора
//	/pozitsiya/*   — «Позиция» (Next.js, 3000)
//	/pozitsiya-api — её API (4000), префикс снимается
//	всё остальное  — старый «Конвертер спецификаций» (8138), как было
//
// Старую программу трогать не нужно: она просто переезжает с 8137 на 8138,
// а 8137 занимает шлюз. Снаружи (Cloudflare Tunnel → nginx) ничего не меняется.
package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

const prefix = "/pozitsiya"

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func proxyTo(raw string) *httputil.ReverseProxy {
	target, err := url.Parse(raw)
	if err != nil {
		log.Fatalf("плохой адрес %q: %v", raw, err)
	}
	p := httputil.NewSingleHostReverseProxy(target)
	base := p.Director
	p.Director = func(r *http.Request) {
		// Настоящее имя сайта берём до того, как подменим Host на внутренний:
		// в Go оно лежит в r.Host, а не в заголовках, и Header.Get("Host") пуст.
		outer := r.Host
		base(r)
		r.Host = target.Host
		if outer != "" {
			r.Header.Set("X-Forwarded-Host", outer)
		}
		r.Header.Set("X-Forwarded-Proto", "https")
	}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("upstream %s %s: %v", target, r.URL.Path, err)
		w.WriteHeader(http.StatusBadGateway)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<meta charset="utf-8"><p style="font:16px system-ui;padding:2rem">
		Программа сейчас недоступна — перезапускается. Обновите страницу через минуту.</p>`))
	}
	return p
}

func main() {
	port := env("PORT", "8137")
	next := proxyTo(env("NEXT_URL", "http://127.0.0.1:3000"))
	api := proxyTo(env("API_URL", "http://127.0.0.1:4000"))
	legacy := proxyTo(env("LEGACY_URL", "http://127.0.0.1:8138"))

	mux := http.NewServeMux()

	// Страница выбора — только на точном «/».
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.Write([]byte(chooserHTML))
			return
		}
		legacy.ServeHTTP(w, r) // старый фронт и его /api/* — без изменений
	})

	// Вход в старую программу: отдаём её корень.
	mux.HandleFunc("/konverter", func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/"
		legacy.ServeHTTP(w, r)
	})

	// API «Позиции»: /pozitsiya-api/api/projects → /api/projects
	mux.HandleFunc(prefix+"-api/", func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = strings.TrimPrefix(r.URL.Path, prefix+"-api")
		api.ServeHTTP(w, r)
	})

	// Сама «Позиция» — путь уже содержит basePath, передаём как есть.
	// Корень у неё без косой черты («/pozitsiya»), поэтому обрабатываем оба вида:
	// свой редирект здесь устроил бы петлю с редиректом самого Next.js.
	mux.Handle(prefix+"/", next)
	mux.Handle(prefix, next)

	addr := "127.0.0.1:" + port
	log.Printf("🚪 Шлюз на http://%s  (Позиция %s/ · Конвертер /konverter)", addr, prefix)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
