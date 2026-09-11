"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Сводка" },
  { href: "/spec", label: "Спецификация" },
  { href: "/offers", label: "Анализ КП" },
  { href: "/audit", label: "Сверка с заявкой" },
  { href: "/supply", label: "Поставки и склад" },
  { href: "/acts", label: "Акты и ИТД" },
];

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="mt-3 flex gap-1 border-b border-ink-200">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.href}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
