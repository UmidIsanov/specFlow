import Link from "next/link";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)] ${className}`}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const toneCls = {
    default: "text-ink-900",
    warn: "text-amber-600",
    danger: "text-red-600",
    good: "text-emerald-600",
  }[tone];
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular ${toneCls}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-400">{hint}</div> : null}
    </Card>
  );
}

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  OK: { label: "Соответствует", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ANALOG_OK: { label: "Аналог — годен", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  ANALOG_RISK: { label: "Аналог — проверить", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  REJECT: { label: "Не подходит", cls: "bg-red-50 text-red-700 border-red-200" },
  PENDING: { label: "Нет в проекте", cls: "bg-ink-100 text-ink-600 border-ink-200" },
};

export function VerdictBadge({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  const s = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.PENDING;
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.cls} ${className}`}>
      {s.label}
    </span>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "green" | "amber" | "red" }) {
  const cls = {
    gray: "bg-ink-100 text-ink-600 border-ink-200",
    blue: "bg-brand-50 text-brand-600 border-blue-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[tone];
  return <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const color = v >= 0.999 ? "bg-emerald-500" : v > 0 ? "bg-brand-500" : "bg-ink-200";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="p-10 text-center">
      <div className="font-medium">{title}</div>
      {hint ? <div className="mt-1 text-sm text-ink-400">{hint}</div> : null}
    </Card>
  );
}

export function LinkButton({ href, children, variant = "ghost" }: { href: string; children: ReactNode; variant?: "solid" | "ghost" }) {
  const cls =
    variant === "solid"
      ? "bg-brand-500 text-white hover:bg-brand-600 border-transparent"
      : "bg-white text-ink-900 hover:bg-ink-50 border-ink-200";
  return (
    <Link href={href} className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium ${cls}`}>
      {children}
    </Link>
  );
}
