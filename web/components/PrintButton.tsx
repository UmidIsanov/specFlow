"use client";

export default function PrintButton({ label = "Печать / PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50"
    >
      {label}
    </button>
  );
}
