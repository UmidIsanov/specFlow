#!/usr/bin/env bash
# Установка «Позиции» рядом с уже работающим конвертером на spec.biy.kz.
# Без sudo, всё живёт в домашней папке. Запуск: bash deploy/biy/install.sh
set -e
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

echo "== 1. Проверки =="
command -v node >/dev/null || { echo "❌ Нет node. Поставьте Node 20+ и повторите."; exit 1; }
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -ge 20 ] || { echo "❌ Node $(node -v) слишком старый, нужен 20+."; exit 1; }
echo "node $(node -v) — годится"

MEM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')
if [ -n "$MEM_MB" ] && [ "$MEM_MB" -lt 1800 ]; then
    echo "⚠️  Памяти $MEM_MB МБ — сборке интерфейса нужно около 1.5 ГБ."
    echo "   Если на шаге 4 процесс убьют, соберите интерфейс на своём компьютере"
    echo "   и принесите папку web/.next/standalone (см. deploy/biy/README.md)."
fi

echo "== 2. Зависимости API =="
npm install --prefix server --no-audit --fund=false

echo "== 3. База данных =="
export DATABASE_URL="file:$ROOT/server/prisma/dev.db"
npm run db:push --prefix server

echo "== 4. Сборка API и интерфейса =="
npm run build --prefix server
npm install --prefix web --no-audit --fund=false
BASE_PATH=/pozitsiya NEXT_PUBLIC_API_URL=/pozitsiya-api npm run build --prefix web
echo "✅ Интерфейс собран"

echo "== 5. Ключ Gemini =="
if [ ! -f converter/.env ]; then
    echo "⚠️  Нет converter/.env — распознавание PDF работать не будет."
    echo "   Скопируйте ключ из старой программы:"
    echo "   cp ~/converter/.env $ROOT/converter/.env"
fi
chmod +x converter/converter-go deploy/gateway-linux-amd64 2>/dev/null || true

echo
echo "================ ГОТОВО ================"
echo "Запуск:  bash $ROOT/deploy/biy/start.sh"
echo "========================================"
