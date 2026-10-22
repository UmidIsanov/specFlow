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

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
