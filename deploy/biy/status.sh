#!/usr/bin/env bash
# Живы ли все части. Ничего не меняет.
cd "$(dirname "$0")/../.."
check() { printf "%-26s %s\n" "$1" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$2")"; }
echo "код 200 — хорошо, 000 — не отвечает"
check "шлюз, страница выбора"  http://127.0.0.1:8137/
check "старый конвертер"       http://127.0.0.1:8137/konverter
check "Позиция"                http://127.0.0.1:8137/pozitsiya
check "API Позиции"            http://127.0.0.1:8137/pozitsiya-api/api/health
echo
echo "== процессы =="
for n in converter api web gateway; do
    if [ -f "logs/$n.pid" ] && kill -0 "$(cat logs/$n.pid)" 2>/dev/null; then
        echo "   $n работает (PID $(cat logs/$n.pid))"
    else
        echo "   $n НЕ работает — смотрите logs/$n.log"
    fi
done
