import { PUBLIC_API } from "@/lib/api";

/** Единая кнопка выгрузки в Excel — ссылка на API, скачивание делает браузер. */
export default function ExportButton({ path, label = "Выгрузить в Excel" }: { path: string; label?: string }) {
  return (
    <a
      href={`${PUBLIC_API}/api${path}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
      </svg>
      {label}
    </a>
  );
}
