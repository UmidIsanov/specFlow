#!/usr/bin/env bash
# Остановить «Позицию» и вернуть старый конвертер на 8137 (как было до подселения).
cd "$(dirname "$0")/../.."
LEGACY="${LEGACY_DIR:-$HOME/converter}"
for n in gateway web api converter; do
    [ -f "logs/$n.pid" ] && kill "$(cat logs/$n.pid)" 2>/dev/null && echo "остановлен $n"
    rm -f "logs/$n.pid"
done
[ -d "$LEGACY" ] && (cd "$LEGACY" && PORT=8137 bash start.sh) && echo "старый конвертер снова на 8137"
