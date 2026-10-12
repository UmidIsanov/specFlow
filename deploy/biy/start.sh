#!/usr/bin/env bash
# Запуск всего, что нужно на spec.biy.kz. Повторный запуск = перезапуск.
#
#   8137  шлюз          — единственная дверь наружу (её отдаёт Cloudflare Tunnel)
#   8138  старый конвертер — переехал с 8137, сам не изменился
#   8139  конвертер «Позиции»
#   4000  API «Позиции»
#   3000  интерфейс «Позиции»
set -e
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
LEGACY="${LEGACY_DIR:-$HOME/converter}"
mkdir -p logs

stop() {  # stop <имя>
    if [ -f "logs/$1.pid" ] && kill -0 "$(cat "logs/$1.pid")" 2>/dev/null; then
        kill "$(cat "logs/$1.pid")" 2>/dev/null || true
    fi
    rm -f "logs/$1.pid"
}
run() {   # run <имя> <команда...>
    local name="$1"; shift
    stop "$name"
    nohup "$@" > "logs/$name.log" 2>&1 &
    echo $! > "logs/$name.pid"
    echo "   $name — PID $(cat "logs/$name.pid")"
}

echo "== 1. Старый конвертер → порт 8138 =="
if [ -d "$LEGACY" ]; then
    (cd "$LEGACY" && PORT=8138 bash start.sh >/dev/null 2>&1) && echo "   переставлен на 8138"
else
    echo "   ⚠️  Папка $LEGACY не найдена — пропускаю"
fi

# Если 8137 всё ещё занят — значит старую программу держит не app.pid,
# а что-то другое (systemd, cron). Лучше остановиться, чем поднять половину:
# пока шлюз не встал, сайт продолжает работать по-старому.
if (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":8137 "; then
    echo "❌ Порт 8137 всё ещё занят старой программой."
    echo "   Найдите, кто её держит:  ss -ltnp | grep 8137"
    echo "   Остановите и повторите. Сайт сейчас работает как раньше — ничего не сломано."
    exit 1
fi

echo "== 2. Сервисы «Позиции» =="
export DATABASE_URL="file:$ROOT/server/prisma/dev.db"
run converter env PORT=8139 FRONTEND_DIST=/nonexistent "$ROOT/converter/converter-go"
run api        env PORT=4000 CONVERTER_URL=http://127.0.0.1:8139 RECOGNIZER=auto \
               DATABASE_URL="$DATABASE_URL" node "$ROOT/server/dist/src/index.js"
run web        env PORT=3000 HOSTNAME=127.0.0.1 API_URL=http://127.0.0.1:4000 \
               node "$ROOT/web/.next/standalone/server.js"

echo "== 3. Шлюз на 8137 =="
run gateway env PORT=8137 NEXT_URL=http://127.0.0.1:3000 API_URL=http://127.0.0.1:4000 \
            LEGACY_URL=http://127.0.0.1:8138 "$ROOT/deploy/gateway-linux-amd64"

echo
echo "Проверка через полминуты:  bash $ROOT/deploy/biy/status.sh"
echo "Логи:                      tail -f $ROOT/logs/*.log"
