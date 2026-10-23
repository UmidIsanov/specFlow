import { NextResponse, type NextRequest } from "next/server";

/** Страницы, куда пускаем без входа. */
const OPEN = ["/login", "/register"];

/**
 * Первая дверь: без cookie сессии дальше не пускаем. Саму сессию проверяет API —
 * здесь только наличие, чтобы не ходить в базу на каждый переход по интерфейсу.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.has("poz_session")) return NextResponse.next();

  // Адрес страницы входа Next требует абсолютным, а за шлюзом spec.biy.kz в
  // запросе стоит внутренний Host (127.0.0.1:3000) — по нему человек уехал бы
  // на localhost. Настоящее имя сайта шлюз передаёт в X-Forwarded-Host.
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const next = encodeURIComponent(`${pathname}${search}`);
  const url = new URL(`${req.nextUrl.basePath}/login?next=${next}`, `${proto}://${host}`);
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
