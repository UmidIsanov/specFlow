#!/usr/bin/env bash
# Обновление до свежей версии: bash /opt/sverka/deploy/update.sh
set -euo pipefail
DIR=/opt/sverka
cd "$DIR"

echo "→ забираю изменения"
sudo -u sverka git pull --ff-only

echo "→ сборка"
sudo -u sverka bash "$DIR/deploy/build.sh"

echo "→ перезапуск"
cp "$DIR"/deploy/sverka-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart sverka-converter sverka-api sverka-web
sleep 3
systemctl --no-pager --lines=0 status sverka-converter sverka-api sverka-web | grep -E "●|Active:"
echo "✅ обновлено"
