"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ABBR, splitByAbbr, type AbbrEntry } from "@/lib/abbr";

type Spot = { x: number; y: number; below: boolean };

const POPUP_HALF = 150; // половина ширины карточки — чтобы не уехала за край экрана
const POPUP_HEIGHT = 170;

function Popup({ term, entry, spot, id }: { term: string; entry: AbbrEntry; spot: Spot; id: string }) {
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-50 w-[min(300px,82vw)]"
      style={{
        left: spot.x,
        top: spot.y,
        transform: spot.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      <div className="rounded-xl border border-ink-200 bg-white p-3 text-left shadow-[0_10px_30px_rgba(16,24,40,.16)]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{term}</div>
        <div className="mt-0.5 text-sm font-semibold leading-snug text-ink-900">{entry.full}</div>
        <div className="mt-1 text-xs leading-relaxed text-ink-600">{entry.hint}</div>
      </div>
    </div>
  );
}

/**
 * Сокращение с расшифровкой: наведение мышкой, фокус с клавиатуры, касание на телефоне.
 *
 * Карточка живёт на body и позиционируется по экрану: внутри таблиц с прокруткой
 * обычный absolute обрезался бы краем контейнера.
 */
export function Abbr({ term, children }: { term: string; children?: ReactNode }) {
  const entry = ABBR[term.toUpperCase()];
  const ref = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const id = useId();

  useEffect(() => {
    if (!spot) return;
    const close = () => setSpot(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [spot]);

  if (!entry) return <>{children ?? term}</>;

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.bottom + POPUP_HEIGHT < window.innerHeight;
    setSpot({
      x: Math.min(Math.max(r.left + r.width / 2, POPUP_HALF + 8), window.innerWidth - POPUP_HALF - 8),
      y: below ? r.bottom + 8 : r.top - 8,
      below,
    });
  };

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        aria-describedby={spot ? id : undefined}
        onPointerEnter={(e) => {
          // на телефоне наведения нет: там работает касание ниже
          if (e.pointerType !== "touch") open();
        }}
        onPointerLeave={() => setSpot(null)}
        onFocus={open}
        onBlur={() => setSpot(null)}
        onClick={() => (spot ? setSpot(null) : open())}
        onKeyDown={(e) => {
          if (e.key === "Escape") setSpot(null);
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (spot) setSpot(null);
            else open();
          }
        }}
        className="cursor-help underline decoration-dotted decoration-ink-400 underline-offset-[3px] outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {children ?? term}
      </span>
      {spot ? createPortal(<Popup term={term} entry={entry} spot={spot} id={id} />, document.body) : null}
    </>
  );
}

/** То же, но по всему тексту: «Акты и ИТД» — подсказка повиснет на ИТД. */
export function AbbrText({ children }: { children: string }) {
  return (
    <>
      {splitByAbbr(children).map((part, i) =>
        typeof part === "string" ? part : <Abbr key={`${part.term}-${i}`} term={part.term} />
      )}
    </>
  );
}

export default Abbr;
