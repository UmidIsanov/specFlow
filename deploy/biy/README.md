# Подселение «Позиции» на spec.biy.kz

Временное решение: показать клиенту обе программы на одном адресе, пока не
куплен свой сервер. Старую программу не переписываем — она переезжает с порта
8137 на 8138 и продолжает работать как раньше.

## Что увидит клиент

| Адрес | Что открывается |
|---|---|
| `spec.biy.kz/` | страница выбора: две карточки |
| `spec.biy.kz/konverter` | старый конвертер PDF → Excel |
| `spec.biy.kz/pozitsiya` | «Позиция» |

## Как устроено внутри

Снаружи всё так же приходит на порт 8137 — Cloudflare Tunnel и nginx трогать не
нужно. Только теперь на 8137 стоит не конвертер, а маленький шлюз, который
смотрит на адрес и передаёт запрос нужной программе:

```
Cloudflare Tunnel → 8137 шлюз ┬─ /            страница выбора
                              ├─ /pozitsiya   → 3000  интерфейс «Позиции»
                              ├─ /pozitsiya-api → 4000  её API
                              └─ всё прочее   → 8138  старый конвертер
                                                8139  конвертер «Позиции»
```

Шлюз — один файл `deploy/gateway-linux-amd64` (6 МБ, без зависимостей).

## Установка

```bash
cd ~
git clone https://github.com/UmidIsanov/specFlow.git pozitsiya
cd pozitsiya
bash deploy/biy/check.sh        # посмотреть, что умеет сервер
cp ~/converter/.env converter/.env   # ключ Gemini — тот же, что у старой программы
bash deploy/biy/install.sh      # зависимости и сборка, 5–10 минут
bash deploy/biy/start.sh        # запуск
bash deploy/biy/status.sh       # проверка: везде должно быть 200
```

## Автозапуск после перезагрузки

В `crontab -e` строку старой программы нужно заменить, иначе после перезагрузки
она снова займёт 8137 и подерётся со шлюзом:

```
@reboot sleep 20 && bash ~/pozitsiya/deploy/biy/start.sh >> ~/pozitsiya/logs/boot.log 2>&1
```

`start.sh` сам поднимает и старую программу на 8138 — отдельная строка для неё
больше не нужна.

## Обновление

```bash
cd ~/pozitsiya && git pull && bash deploy/biy/install.sh && bash deploy/biy/start.sh
```

## Как всё вернуть как было

```bash
bash ~/pozitsiya/deploy/biy/stop.sh
```

Старый конвертер снова встанет на 8137, и `spec.biy.kz` будет открывать его
напрямую, как до подселения.

## Если интерфейс не собирается на сервере

`next build` просит около 1.5 ГБ памяти. Если процесс убивают, соберите на своём
компьютере и перенесите результат:

```bash
# на своём компьютере
cd ~/Documents/specflow/web
BASE_PATH=/pozitsiya NEXT_PUBLIC_API_URL=/pozitsiya-api npm run build

tar czf ~/Desktop/web-build.tgz -C .next standalone
# затем положить архив на сервер и распаковать:
#   tar xzf web-build.tgz -C ~/pozitsiya/web/.next
```

## Чего здесь нет

Входа по паролю. Любой, кто знает адрес, видит все КП и цены. Для показа
клиенту это терпимо, для работы — нет. На своём сервере первым делом сделаем
учётные записи.
