import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Сверка — спецификации, КП и склад на объекте",
  description: "Спецификации, анализ КП, поставки, склад и ИТД на объекте",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="no-print border-b border-ink-200 bg-white">
          <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-xs font-semibold text-white">СВ</span>
              Сверка
            </Link>
            <span className="text-xs text-ink-400">
              Спецификации · КП · Поставки · Склад · ИТД
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
