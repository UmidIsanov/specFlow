"use client";

import Link from "next/link";

/**
 * Объект исчез из-под ног: его удалили, человека убрали из команды или
 * открыли чужую ссылку. Показываем это словами, а не красным экраном Next.
 */
export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-ink-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">Объект недоступен</h1>
      <p className="mt-2 text-sm text-ink-600">
        Либо его удалили, либо вас убрали из команды, либо ссылка ведёт на чужой объект. Попросите того, кто ведёт
        объект, пригласить вас заново.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <button type="button" onClick={reset} className="rounded-lg border border-ink-200 px-3 py-1.5 font-medium hover:bg-ink-50">
          Попробовать ещё раз
        </button>
        <Link href="/" className="rounded-lg bg-brand-500 px-3 py-1.5 font-medium text-white hover:bg-brand-600">
          К списку объектов
        </Link>
      </div>
    </div>
  );
}
