# Установка «Сверки» на сервер

## Что нужно от сервера

| | |
|---|---|
| ОС | Ubuntu 24.04 LTS |
| Память | **4 ГБ** (меньше не стоит: сборка интерфейса требует ~1,5 ГБ) |
| Процессор | 2 ядра |
| Диск | 40 ГБ SSD |

В работе все три сервиса занимают около 400 МБ: конвертер (Go) — 20 МБ, API — 120 МБ,
интерфейс — 170 МБ. Запас нужен именно под сборку.

## Установка

```bash
ssh root@АДРЕС_СЕРВЕРА
git clone https://github.com/UmidIsanov/specFlow.git /opt/sverka
DOMAIN=sverka.uz bash /opt/sverka/deploy/setup.sh
```

Скрипт поставит Node, Go, poppler, nginx и certbot, соберёт проект, пропишет три службы
systemd, выпустит сертификат и спросит пароль для входа.

После установки впишите ключ Gemini и перезапустите конвертер:

```bash
nano /opt/sverka/converter/.env      # GEMINI_API_KEY=...
systemctl restart sverka-converter
```

## Обновление

```bash
bash /opt/sverka/deploy/update.sh
```

## Как всё устроено

```
браузер → nginx (443, пароль, https)
            ├── /api/ → 127.0.0.1:4000   API (Express + SQLite)
            └── /     → 127.0.0.1:3000   интерфейс (Next.js)
                            API → 127.0.0.1:8137   конвертер (Go + Gemini)
```

Наружу смотрит только nginx. Конвертер и API доступны лишь изнутри сервера.

## Повседневное

```bash
systemctl status sverka-api            # состояние
journalctl -u sverka-api -f            # журнал API
journalctl -u sverka-converter -f      # журнал распознавания, с токенами
systemctl restart sverka-web           # перезапуск
```

## Данные и резервная копия

Всё ценное лежит в двух местах:

- `server/prisma/dev.db` — объекты, спецификации, КП, поставки, акты;
- `server/data/recognized/` — кэш распознанных сканов (экономит токены Gemini).

Копия:

```bash
tar czf ~/sverka-$(date +%F).tar.gz -C /opt/sverka server/prisma/dev.db server/data
```

Поставьте это в `crontab -e` строкой `0 3 * * * tar czf /root/sverka-$(date +\%F).tar.gz -C /opt/sverka server/prisma/dev.db server/data`.

## Важно: входа по пользователям пока нет

В платформе нет учётных записей — кто открыл адрес, тот видит все объекты, КП и цены.
Поэтому `nginx.conf` закрывает вход паролем (HTTP Basic). Это защита от посторонних,
но не разграничение прав: у инженера, снабжения и руководителя сейчас одинаковый доступ.
Нормальные учётные записи с ролями — следующий шаг.

Добавить ещё одного человека:

```bash
htpasswd /etc/nginx/.htpasswd имя
```
