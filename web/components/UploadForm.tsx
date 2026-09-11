"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PUBLIC_API } from "@/lib/api";
import type { WorkbookInfo } from "@/lib/types";

type Field = { name: string; label: string; options?: { value: string; label: string }[] };

/**
 * Загрузка Excel (спецификация или КП).
 * Выгрузка pdf-spec-converter — книга из нескольких листов, поэтому сначала
 * показываем, что в файле, и даём выбрать нужный лист.
 */
const isPdf = (file?: File | null) => !!file && /\.pdf$/i.test(file.name);

export default function UploadForm({
  action,
  pdfAction,
  title,
  hint,
  fields = [],
  submitLabel = "Загрузить",
}: {
  action: string;
  /** Куда отправлять PDF: у него своя разборка по сетке таблицы. */
  pdfAction?: string;
  title: string;
  hint?: string;
  fields?: Field[];
  submitLabel?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [book, setBook] = useState<WorkbookInfo | null>(null);
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setBook(null);
    setSheet("");
    setMessage(null);
    setError(null);
    if (!file) return;
    // у PDF листов нет — разбирать нечего, идём сразу на импорт
    if (isPdf(file)) return;

    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${PUBLIC_API}/api/spec/inspect`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Не удалось прочитать файл");
      const info: WorkbookInfo = await res.json();
      setBook(info);
      setSheet(info.recommended);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения файла");
    } finally {
      setScanning(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file") as File | null;
    if (!file?.size) {
      setError("Выберите файл");
      return;
    }
    const target = isPdf(file) && pdfAction ? pdfAction : action;
    if (sheet && !isPdf(file)) fd.set("sheet", sheet);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${PUBLIC_API}${target}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setMessage(
        typeof data.created === "number"
          ? `Загружено строк: ${data.created}${data.sheet ? ` (лист «${data.sheet}»)` : ""}`
          : "Файл обработан, технический анализ выполнен"
      );
      form.reset();
      setBook(null);
      setSheet("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  const active = book?.sheets.find((s) => s.name === sheet);

  return (
    <form ref={formRef} onSubmit={submit} className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="font-medium">{title}</div>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept={pdfAction ? ".xlsx,.xls,.csv,.pdf" : ".xlsx,.xls,.csv"}
          onChange={onFile}
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-ink-200 file:bg-ink-50 file:px-3 file:py-1.5 file:text-sm"
        />
        {fields.map((f) =>
          f.options ? (
            <select key={f.name} name={f.name} className="input w-auto" defaultValue={f.options[0]?.value}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input key={f.name} name={f.name} placeholder={f.label} className="input w-40" />
          )
        )}
        <button
          disabled={busy || scanning}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "Обработка…" : submitLabel}
        </button>
      </div>

      {scanning ? <p className="mt-2 text-sm text-ink-400">Читаю файл…</p> : null}

      {book && book.sheets.length > 0 ? (
        <div className="mt-3 rounded-lg bg-ink-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-600">Лист:</span>
            <select value={sheet} onChange={(e) => setSheet(e.target.value)} className="input w-auto">
              {book.sheets.map((s) => (
                <option key={s.name} value={s.name} disabled={s.rows === 0}>
                  {s.name} — {s.rows === 0 ? "таблица не распознана" : `${s.rows} строк`}
                </option>
              ))}
            </select>
            {sheet === book.recommended ? (
              <span className="text-xs text-emerald-600">выбран автоматически — самый полный</span>
            ) : null}
          </div>
          {active && active.columns.length > 0 ? (
            <p className="mt-2 text-xs text-ink-400">Распознаны колонки: {active.columns.join(", ")}</p>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-2 text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
