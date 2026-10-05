#!/usr/bin/env bash
# Сборка всех трёх частей. Запускается от пользователя pozitsiya.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "  · конвертер (Go)"
(cd converter/backend-go && go build -ldflags='-s -w' -o ../converter-go .)

echo "  · API"
npm ci --prefix server --omit=dev --silent || npm install --prefix server --silent
npm install --prefix server --silent --include=dev
npx --prefix server prisma generate --schema server/prisma/schema.prisma >/dev/null
npx --prefix server prisma db push --schema server/prisma/schema.prisma --skip-generate >/dev/null
npm run build --prefix server --silent

echo "  · веб"
npm install --prefix web --silent
npm run build --prefix web --silent
