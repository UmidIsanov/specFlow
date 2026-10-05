#!/usr/bin/env bash
# Обновление до свежей версии: bash /opt/pozitsiya/deploy/update.sh
set -euo pipefail
DIR=/opt/pozitsiya
cd "$DIR"

echo "→ забираю изменения"
sudo -u pozitsiya git pull --ff-only

echo "→ сборка"
sudo -u pozitsiya bash "$DIR/deploy/build.sh"

echo "→ перезапуск"
cp "$DIR"/deploy/pozitsiya-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart pozitsiya-converter pozitsiya-api pozitsiya-web
sleep 3
systemctl --no-pager --lines=0 status pozitsiya-converter pozitsiya-api pozitsiya-web | grep -E "●|Active:"
echo "✅ обновлено"
