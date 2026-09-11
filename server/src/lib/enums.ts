export const MATCH = { EXACT: "EXACT", ANALOG: "ANALOG", NONE: "NONE" } as const;
export const VERDICT = {
  PENDING: "PENDING",
  OK: "OK",
  ANALOG_OK: "ANALOG_OK",
  ANALOG_RISK: "ANALOG_RISK",
  REJECT: "REJECT",
} as const;
export const MOVE = { IN: "IN", OUT: "OUT", ADJUST: "ADJUST" } as const;

export const SYSTEMS = ["ПС", "СКС", "СОТ", "АПТ", "ПЕРИМЕТР", "СОУЭ", "СКУД"] as const;
