// Описание сервисов «Позиции» для PM2 — тем же способом, которым на этом
// сервере уже живут другие программы.
//
//   8139  конвертер «Позиции»   (Gemini, читает PDF)
//   4000  API                   (база, сверка, склад)
//   3000  интерфейс             (собранный Next.js)
//   8137  шлюз                  (единственная дверь наружу)
//
// Старый конвертер остаётся под своим именем в PM2 и переезжает на 8138 —
// это делает pm2-start.sh.
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

const common = { cwd: ROOT, autorestart: true, max_restarts: 10, time: true };

module.exports = {
  apps: [
    {
      ...common,
      name: "poz-converter",
      script: path.join(ROOT, "converter", "converter-go"),
      cwd: path.join(ROOT, "converter"),
      env: { PORT: "8139", FRONTEND_DIST: "/nonexistent" },
    },
    {
      ...common,
      name: "poz-api",
      script: path.join(ROOT, "server", "dist", "src", "index.js"),
      env: {
        PORT: "4000",
        DATABASE_URL: "file:" + path.join(ROOT, "server", "prisma", "dev.db"),
        CONVERTER_URL: "http://127.0.0.1:8139",
        RECOGNIZER: "auto",
        // Cookie входа только по https. Сейчас выключено: домен отвечает и по http,
        // а с secure-cookie вход по http молча не работал бы. Включить "1", когда
        // на spec.biy.kz появится редирект http → https.
        COOKIE_SECURE: "",
      },
    },
    {
      ...common,
      name: "poz-web",
      script: path.join(ROOT, "web", ".next", "standalone", "server.js"),
      env: {
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
        API_URL: "http://127.0.0.1:4000",
      },
    },
    {
      ...common,
      name: "poz-gateway",
      script: path.join(ROOT, "deploy", "gateway-linux-amd64"),
      env: {
        PORT: "8137",
        NEXT_URL: "http://127.0.0.1:3000",
        API_URL: "http://127.0.0.1:4000",
        LEGACY_URL: "http://127.0.0.1:8138",
      },
    },
  ],
};
