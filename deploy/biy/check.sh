#!/usr/bin/env bash
# Что умеет сервер. Ничего не меняет — только смотрит.
echo "== система =="; . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"; uname -m
echo "== память =="; free -h 2>/dev/null | head -2
echo "== диск =="; df -h "$HOME" | tail -1
echo "== ядра =="; nproc
echo "== node =="; node -v 2>/dev/null || echo "НЕТ"
echo "== npm =="; npm -v 2>/dev/null || echo "НЕТ"
echo "== git =="; git --version 2>/dev/null || echo "НЕТ"
echo "== sudo =="; sudo -n true 2>/dev/null && echo "есть без пароля" || echo "нет или нужен пароль"
echo "== занятые порты =="; (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -E ":(3000|4000|8137|8138|8139)\b" || echo "3000/4000/8137/8138/8139 свободны (кроме того, что уже слушает конвертер)"
echo "== что слушает конвертер =="; (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep 8137 || echo "8137 не слушается"
echo "== домашняя папка =="; ls ~
echo "== автозапуск =="; crontab -l 2>/dev/null || echo "crontab пуст"
echo "== cloudflared / nginx =="; ls ~/.cloudflared 2>/dev/null; command -v cloudflared || echo "cloudflared не в PATH"; command -v nginx || echo "nginx не в PATH"
