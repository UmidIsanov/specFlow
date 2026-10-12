import type { NextConfig } from "next";

/**
 * BASE_PATH — префикс, под которым приложение живёт на чужом домене.
 * Пустой (по умолчанию) — своя площадка: pozitsiya.uz/…
 * "/pozitsiya" — подселение к уже работающей программе: spec.biy.kz/pozitsiya/…
 *
 * Значение читается на сборке: после смены префикса нужен новый `npm run build`.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  basePath,
  // Самодостаточная сборка: .next/standalone можно унести на сервер
  // без node_modules — внутри только то, что реально используется.
  output: "standalone",
};

export default nextConfig;
