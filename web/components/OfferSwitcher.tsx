"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Переключение между КП разных поставщиков на одной заявке. */
export default function OfferSwitcher({
  offers,
  currentId,
}: {
  offers: { id: string; supplier: string; number: string | null; currency: string }[];
  currentId: string;
}) {
  const pathname = usePathname();
  if (offers.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1">
      {offers.map((o) => (
        <Link
          key={o.id}
          href={`${pathname}?offerId=${o.id}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            o.id === currentId ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
          }`}
        >
          {o.supplier}
          <span className="ml-1 text-xs text-ink-400">{o.currency}</span>
        </Link>
      ))}
    </div>
  );
}
