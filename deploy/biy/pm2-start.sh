#!/usr/bin/env bash
# Запуск «Позиции» на сервере, где процессами управляет PM2.
# Трогает ровно две вещи: старый конвертер (переезжает на 8138) и свои четыре
# сервиса. Остальные программы в PM2 не затрагиваются.
set -e
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
command -v pm2 >/dev/null || { echo "❌ PM2 не найден"; exit 1; }

echo "== 1. Ищу старый конвертер в PM2 =="
LEGACY_NAME=$(pm2 jlist 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let apps=[];try{apps=JSON.parse(s)}catch(e){}
  const hit=apps.find(a=>{
    const p=(a.pm2_env&&a.pm2_env.pm_exec_path)||"";
    return /converter-go$/.test(p) && !p.includes("/pozitsiya/");
  });
  if(hit)process.stdout.write(hit.name);
});')

if [ -z "$LEGACY_NAME" ]; then
    echo "   не нашёл — видимо, он запущен не через PM2."
    echo "   Остановите его сами, освободите 8137 и повторите."
    exit 1
fi
echo "   это «$LEGACY_NAME»"

echo "== 2. Переставляю его на 8138 =="
PORT=8138 pm2 restart "$LEGACY_NAME" --update-env >/dev/null
sleep 2
if ! (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":8138 "; then
    echo "❌ На 8138 никто не слушает. Смотрите:  pm2 logs $LEGACY_NAME --lines 30"
    echo "   Возвращаю как было."
    PORT=8137 pm2 restart "$LEGACY_NAME" --update-env >/dev/null
    exit 1
fi
if (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":8137 "; then
    echo "❌ 8137 всё ещё занят — шлюзу некуда встать. Ничего не менял дальше."
    exit 1
fi
echo "   готово: 8138 слушает, 8137 свободен"

echo "== 3. Запускаю сервисы «Позиции» =="
pm2 start deploy/biy/pm2.config.cjs >/dev/null
pm2 save >/dev/null
echo "   запущены и записаны в автозапуск"

echo
pm2 list
echo
echo "Проверка:  bash $ROOT/deploy/biy/status.sh"
