"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PUBLIC_API } from "@/lib/api";
import type { WorkbookInfo } from "@/lib/types";

type Field = { name: string; label: string; options?: { value: string; label: string }[] };

type Result = {
  created?: number;
  sheet?: string;
  pages?: number;
  columns?: unknown[];
  buildings?: string[];
  source?: "text" | "converter";
  warnings?: string[];
};
type ConverterStatus = { available: boolean; keyConfigured: boolean };
type Progress = { stage: string; done: number; total: number; startedAt: number };
type JobState = { status: "running" | "done" | "error"; progress: { stage: string; done: number; total: number }; startedAt: number; result?: Result; error?: string };

const POLL_MS = 1000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isPdf = (file: File) => /\.pdf$/i.test(file.name);
const isSheet = (file: File) => /\.(xlsx|xls|csv)$/i.test(file.name);

const fmtSize = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

/**
 * Импорт документа: перетащить или выбрать файл, увидеть, что в нём, и загрузить.
 * Excel из pdf-spec-converter — книга из нескольких листов, поэтому лист показываем до импорта;
 * PDF с текстовым слоем уходит в разбор по сетке таблицы, сканы не читаются.
 */
export default function UploadForm({
  action,
  pdfAction,
  title,
  hint,
  fields = [],
  submitLabel = "Импортировать",
  allowReplace = false,
}: {
  action: string;
  /** Куда отправлять PDF: у него своя разборка по сетке таблицы. */
  pdfAction?: string;
  title: string;
  hint?: string;
  fields?: Field[];
  submitLabel?: string;
  /** Показать флажок «заменить текущие данные». */
  allowReplace?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [book, setBook] = useState<WorkbookInfo | null>(null);
  const [sheet, setSheet] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.options?.[0]?.value ?? ""]))
  );
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converter, setConverter] = useState<ConverterStatus | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // секундомер рядом с прогрессом: человек видит, что процесс живой
  useEffect(() => {
    if (!progress) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - progress.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [progress]);

  // сканы читает отдельный сервис — заранее показываем, подключён ли он
  useEffect(() => {
    if (!pdfAction) return;
    fetch(`${PUBLIC_API}/api/converter/status`)
      .then((r) => r.json())
      .then(setConverter)
      .catch(() => setConverter({ available: false, keyConfigured: false }));
  }, [pdfAction]);

  const accept = pdfAction ? ".xlsx,.xls,.csv,.pdf" : ".xlsx,.xls,.csv";

  const pick = useCallback(
    async (next: File | null) => {
      setFile(next);
      setBook(null);
      setSheet("");
      setResult(null);
      setError(null);
      if (!next) return;

      if (isPdf(next) && !pdfAction) {
        setError("Здесь принимаются только Excel-файлы");
        return;
      }
      if (!isPdf(next) && !isSheet(next)) {
        setError("Поддерживаются .xlsx, .xls, .csv" + (pdfAction ? " и .pdf" : ""));
        return;
      }
      // у PDF листов нет — разбирать нечего
      if (isPdf(next)) return;

      setScanning(true);
      try {
        const fd = new FormData();
        fd.append("file", next);
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
    },
    [pdfAction]
  );

  async function submit() {
    if (!file) {
      setError("Выберите файл");
      return;
    }
    if (allowReplace && replace && !confirm("Текущие данные будут удалены и заменены файлом. Продолжить?")) return;

    const fd = new FormData();
    fd.append("file", file);
    for (const [k, v] of Object.entries(values)) if (v) fd.append(k, v);
    if (sheet && !isPdf(file)) fd.append("sheet", sheet);
    if (allowReplace && replace) fd.append("replace", "true");
    const target = isPdf(file) && pdfAction ? pdfAction : action;

    setBusy(true);
    setError(null);
    setResult(null);
    const startedAt = Date.now();
    if (isPdf(file)) setProgress({ stage: "Отправляю файл", done: 0, total: 0, startedAt });
    try {
      const res = await fetch(`${PUBLIC_API}${target}`, { method: "POST", body: fd });
      let data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);

      // длинный импорт идёт фоновой задачей — опрашиваем её и показываем этап
      if (data.jobId) {
        for (;;) {
          await wait(POLL_MS);
          const jr = await fetch(`${PUBLIC_API}/api/jobs/${data.jobId}`);
          if (!jr.ok) throw new Error("Задача импорта потерялась — повторите");
          const job: JobState = await jr.json();
          setProgress({ ...job.progress, startedAt });
          if (job.status === "error") throw new Error(job.error ?? "Ошибка импорта");
          if (job.status === "done") {
            data = job.result ?? {};
            break;
          }
        }
      }
      setResult(data);
      setFile(null);
      setBook(null);
      setSheet("");
      setReplace(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files?.[0] ?? null);
  };

  const active = book?.sheets.find((s) => s.name === sheet);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="font-medium">{title}</div>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-3 flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-400 hover:bg-ink-50"
        }`}
      >
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-ink-400">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
        </svg>
        {file ? (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-ink-400">
              {isPdf(file) ? "PDF" : "Excel"} · {fmtSize(file.size)}
              {scanning ? " · читаю…" : ""}
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <span className="font-medium text-brand-600">Выберите файл</span>
            <span className="text-ink-600"> или перетащите сюда</span>
            <div className="text-xs text-ink-400">{pdfAction ? "Excel или PDF" : "Excel"}</div>
          </div>
        )}
        {file ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void pick(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-ink-100 hover:text-ink-900"
          >
            убрать
          </button>
        ) : null}
      </div>

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {fields.map((f) =>
          f.options ? (
            <select
              key={f.name}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              className="input w-auto"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={f.name}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              placeholder={f.label}
              className="input w-40"
            />
          )
        )}
        {allowReplace ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-600">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            заменить текущие данные
          </label>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={busy || scanning || !file || !!error}
          className="ml-auto rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              {progress ? "Идёт импорт" : "Обработка…"}
            </span>
          ) : (
            submitLabel
          )}
        </button>
      </div>

      {progress ? (
        <div className="mt-3 rounded-lg border border-brand-500/30 bg-brand-50 p-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-ink-900">{progress.stage}</span>
            <span className="shrink-0 tabular text-ink-400">
              {progress.total > 0 ? `${Math.round((progress.done / progress.total) * 100)} % · ` : ""}
              {Math.floor(elapsed / 60) > 0 ? `${Math.floor(elapsed / 60)} мин ` : ""}
              {elapsed % 60} с
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white">
            {progress.total > 0 ? (
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }}
              />
            ) : (
              <div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand-500" />
            )}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {progress.total > 0
              ? `Готово ${progress.done} из ${progress.total}. Скан читается по частям, каждая — около минуты. Страницу можно не закрывать, но и ждать у экрана не обязательно.`
              : "PDF с текстом читается за секунды, скан — до нескольких минут."}
          </p>
        </div>
      ) : null}
      {pdfAction && converter ? (
        <p className="mt-2 text-xs text-ink-400">
          {converter.available && converter.keyConfigured ? (
            <><span className="text-emerald-600">●</span> Конвертер сканов подключён — можно загружать и сканы</>
          ) : converter.available ? (
            <><span className="text-amber-600">●</span> Конвертер запущен, но без ключа Gemini — сканы не распознаются</>
          ) : (
            <><span className="text-ink-400">●</span> Конвертер сканов не запущен — читаются только PDF с текстовым слоем</>
          )}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {typeof result.created === "number" ? (
            <>
              Загружено строк: <b>{result.created}</b>
              {result.sheet ? ` · лист «${result.sheet}»` : ""}
              {result.pages ? ` · страниц ${result.pages}` : ""}
              {result.source === "converter" ? " · скан распознан конвертером" : ""}
              {result.buildings?.length ? ` · здания: ${result.buildings.join(", ")}` : ""}
            </>
          ) : (
            <>Файл обработан, технический анализ выполнен{result.source === "converter" ? " · скан распознан конвертером" : ""}</>
          )}
        </div>
      ) : null}
      {result?.warnings?.length ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div className="font-medium">Проверьте глазами — распознавание не гарантирует точность:</div>
          <ul className="mt-1 list-disc pl-5">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
