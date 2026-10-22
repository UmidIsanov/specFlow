import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-ink-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">Страница не найдена</h1>
      <p className="mt-2 text-sm text-ink-600">Такой страницы в «Позиции» нет — возможно, ссылка устарела.</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
      >
        К списку объектов
      </Link>
    </div>
  );
}
