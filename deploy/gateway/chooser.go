package main

// Страница выбора программы. Без внешних файлов — чтобы шлюз оставался
// одним бинарником, который можно просто положить на сервер и запустить.
const chooserHTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Выберите программу</title>
<style>
  :root {
    --brand: #1f6feb; --brand-dark: #1a5fd0;
    --bg: #f6f7f9; --card: #ffffff; --line: #e3e6ea;
    --text: #15181d; --muted: #5b6471;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0f1216; --card: #171b21; --line: #272d36;
      --text: #e9ecf1; --muted: #9aa4b2;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 48px 16px;
  }
  main { width: 100%; max-width: 760px; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -.01em; }
  .sub { color: var(--muted); margin: 0 0 28px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  a.card {
    display: block; text-decoration: none; color: inherit;
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 22px; transition: border-color .15s, transform .15s, box-shadow .15s;
  }
  a.card:hover { border-color: var(--brand); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(31,111,235,.12); }
  a.card:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .badge {
    display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .02em;
    color: var(--brand); background: rgba(31,111,235,.1);
    padding: 3px 9px; border-radius: 999px; margin-bottom: 12px;
  }
  .card h2 { font-size: 19px; margin: 0 0 8px; }
  .card p { margin: 0 0 14px; color: var(--muted); font-size: 14.5px; }
  .card ul { margin: 0; padding-left: 18px; color: var(--muted); font-size: 14px; }
  .card li { margin-bottom: 3px; }
  .go { margin-top: 16px; font-weight: 600; color: var(--brand-dark); font-size: 14.5px; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .go { color: #6ea8ff; } }
  footer { margin-top: 28px; color: var(--muted); font-size: 13px; text-align: center; }
</style>
</head>
<body>
<main>
  <h1>Выберите программу</h1>
  <p class="sub">Две программы на одном адресе. Можно переключаться в любой момент.</p>

  <div class="grid">
    <a class="card" href="/konverter">
      <span class="badge">Работает давно</span>
      <h2>Конвертер спецификаций</h2>
      <p>Чертёж в PDF — на выходе готовая таблица Excel.</p>
      <ul>
        <li>Перетащите один или несколько PDF</li>
        <li>Каждый чертёж — отдельный лист</li>
        <li>Плюс общий сводный лист</li>
      </ul>
      <div class="go">Открыть &rarr;</div>
    </a>

    <a class="card" href="/pozitsiya">
      <span class="badge">Новое</span>
      <h2>Позиция</h2>
      <p>Проверка коммерческих предложений, склад и акты по объекту.</p>
      <ul>
        <li>Сверка КП с заявкой — что лишнее, чего нет</li>
        <li>Цены, отклонения, итог по каждой строке</li>
        <li>Приход, списание, план и факт</li>
      </ul>
      <div class="go">Открыть &rarr;</div>
    </a>
  </div>

  <footer>Внутренний сервис. Не передавайте ссылку посторонним.</footer>
</main>
</body>
</html>`
