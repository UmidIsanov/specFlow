#!/usr/bin/env bash
# Живы ли все части. Ничего не меняет.
cd "$(dirname "$0")/../.."
check() { printf "%-26s %s\n" "$1" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$2")"; }
echo "== снаружи (через шлюз) =="
echo "200 — хорошо, 302 — редирект, 502 — программа не отвечает, 000 — молчит"
check "страница выбора"       http://127.0.0.1:8137/
check "старый конвертер"      http://127.0.0.1:8137/konverter
check "Позиция"               http://127.0.0.1:8137/pozitsiya
check "API Позиции"           http://127.0.0.1:8137/pozitsiya-api/api/health
echo
echo "== напрямую, без шлюза =="
check "интерфейс :3000"       http://127.0.0.1:3000/pozitsiya
check "API :4000"             http://127.0.0.1:4000/api/health
check "конвертер :8139"       http://127.0.0.1:8139/api/health
check "старый на :8138"       http://127.0.0.1:8138/api/health
echo
echo "== процессы =="
pm2 list 2>/dev/null | grep -E "name|poz-|converter" || echo "PM2 не отвечает"
