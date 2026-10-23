#!/usr/bin/env bash
# Обновление «Позиции», когда она уже работает под PM2.
# Отличие от pm2-start.sh: ничего не переставляет по портам и не трогает
# старый конвертер — только перезапускает четыре своих сервиса на новом коде.
# Запуск:  bash deploy/biy/pm2-reload.sh
set -e
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
command -v pm2 >/dev/null || { echo "❌ PM2 не найден"; exit 1; }

echo "== 1. Проверяю, что «Позиция» уже стоит в PM2 =="
if ! pm2 describe poz-gateway >/dev/null 2>&1; then
    echo "   её там нет — это первая установка."
    echo "   Запустите:  bash $ROOT/deploy/biy/pm2-start.sh"
    exit 1
fi
echo "   на месте"

echo "== 2. Перезапускаю на новом коде =="
pm2 reload deploy/biy/pm2.config.cjs --update-env >/dev/null
pm2 save >/dev/null
sleep 3

echo
bash deploy/biy/status.sh
