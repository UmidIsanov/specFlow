#!/usr/bin/env bash
# Вернуть всё как было до подселения: «Позиция» выключена,
# старый конвертер снова один на 8137.
set -e
cd "$(dirname "$0")/../.."
for n in poz-gateway poz-web poz-api poz-converter; do
    pm2 delete "$n" >/dev/null 2>&1 && echo "убран $n" || true
done
LEGACY_NAME=$(pm2 jlist 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let apps=[];try{apps=JSON.parse(s)}catch(e){}
  const hit=apps.find(a=>{
    const p=(a.pm2_env&&a.pm2_env.pm_exec_path)||"";
    return /converter-go$/.test(p) && !p.includes("/pozitsiya/");
  });
  if(hit)process.stdout.write(hit.name);
});')
if [ -n "$LEGACY_NAME" ]; then
    PORT=8137 pm2 restart "$LEGACY_NAME" --update-env >/dev/null
    echo "старый конвертер снова на 8137"
fi
pm2 save >/dev/null
pm2 list
