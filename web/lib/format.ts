export const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export const money = (v: number, currency = "UZS") =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v)} ${currency}`;

export const compactMoney = (v: number, currency = "UZS") => {
  if (Math.abs(v) >= 1_000_000) return `${nf.format(Math.round(v / 100_000) / 10)} млн ${currency}`;
  if (Math.abs(v) >= 1_000) return `${nf.format(Math.round(v / 100) / 10)} тыс ${currency}`;
  return `${nf.format(v)} ${currency}`;
};

export const date = (v: string | Date) =>
  new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

export const pct = (v: number) => `${Math.round(v * 100)}%`;
