import type { ItdPack, ItdScope, ItdState, ItdSummary } from "@/lib/types";

/**
 * Подписи ИТД-контура. Лежат в lib, а не в компоненте: ими пользуются и
 * страница на сервере, и таблица в браузере.
 */

export const STATE_LABEL: Record<ItdState, string> = {
  ACCEPTED: "Работы приняты",
  PARTIAL: "Принято частично",
  REMARKS: "Устраняют замечания",
  REQUESTED: "Инспекция запрошена",
};

export const STATE_TONE: Record<ItdState, "green" | "amber" | "red" | "gray"> = {
  ACCEPTED: "green",
  PARTIAL: "amber",
  REMARKS: "red",
  REQUESTED: "gray",
};

export const PACK_LABEL: Record<ItdPack, string> = {
  EQUIP: "Оборудование",
  CABLE: "Кабель и трассы",
  OTHER: "Прочее",
};

/** Участок одной строкой: «403209 · ACS · Прокладка кабеля». */
export const scopeTitle = (s: Pick<ItdScope, "building" | "system" | "workKind">) =>
  `${s.building} · ${s.system} · ${s.workKind}`;

/**
 * Доля сданного по системе. «Физика принята» — это ещё не сдача участка,
 * поэтому у приёмки работ частично принятые участки идут за половину,
 * а пакет документов считается только целиком.
 */
export const acceptedShare = (r: ItdSummary) =>
  r.scopes ? (r.accepted + r.partial * 0.5) / r.scopes : 0;

export const dossierShare = (r: ItdSummary) => (r.scopes ? r.dossierDone / r.scopes : 0);
