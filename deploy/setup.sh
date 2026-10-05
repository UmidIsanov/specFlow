#!/usr/bin/env bash
# Первая установка «Позиции» на чистый сервер (Ubuntu 24.04).
# Запускать от root: bash deploy/setup.sh
set -euo pipefail

DOMAIN="${DOMAIN:-pozitsiya.uz}"
REPO="${REPO:-https://github.com/UmidIsanov/specFlow.git}"
DIR=/opt/pozitsiya

echo "→ пакеты"
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx apache2-utils poppler-utils golang-go
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
apt-get install -y -qq nodejs

echo "→ пользователь и код"
id pozitsiya &>/dev/null || useradd --system --create-home --home-dir "$DIR" --shell /usr/sbin/nologin pozitsiya
[ -d "$DIR/.git" ] || git clone -q "$REPO" "$DIR"
chown -R pozitsiya:pozitsiya "$DIR"

echo "→ настройки"
if [ ! -f "$DIR/server/.env" ]; then
  cat > "$DIR/server/.env" <<ENV
DATABASE_URL="file:./dev.db"
PORT=4000
CONVERTER_URL=http://127.0.0.1:8137
RECOGNIZER=gemini
ENV
fi
if [ ! -f "$DIR/converter/.env" ]; then
  echo "GEMINI_API_KEY=ВСТАВЬТЕ_КЛЮЧ" > "$DIR/converter/.env"
  echo "   ⚠  впишите ключ Gemini в $DIR/converter/.env"
fi
# адрес API для браузера — тот же домен, nginx разведёт /api
echo "NEXT_PUBLIC_API_URL=https://$DOMAIN" > "$DIR/web/.env.production"
chown -R pozitsiya:pozitsiya "$DIR"

echo "→ сборка"
sudo -u pozitsiya bash "$DIR/deploy/build.sh"

echo "→ сервисы"
cp "$DIR"/deploy/pozitsiya-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pozitsiya-converter pozitsiya-api pozitsiya-web

echo "→ nginx"
sed "s/pozitsiya\.uz/$DOMAIN/g" "$DIR/deploy/nginx.conf" > /etc/nginx/sites-available/pozitsiya
ln -sf /etc/nginx/sites-available/pozitsiya /etc/nginx/sites-enabled/pozitsiya
rm -f /etc/nginx/sites-enabled/default
[ -f /etc/nginx/.htpasswd ] || { echo "   задайте пароль для входа:"; htpasswd -c /etc/nginx/.htpasswd oybek; }
# certbot сам перепишет конфиг под https; до этого nginx не стартует без сертификата
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || true
nginx -t && systemctl reload nginx

echo
echo "✅ Готово: https://$DOMAIN"
echo "   журнал:   journalctl -u pozitsiya-api -f"
echo "   обновить: bash $DIR/deploy/update.sh"
