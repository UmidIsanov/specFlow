export const MATCH = { EXACT: "EXACT", ANALOG: "ANALOG", NONE: "NONE" } as const;
export const VERDICT = {
  PENDING: "PENDING",
  OK: "OK",
  ANALOG_OK: "ANALOG_OK",
  ANALOG_RISK: "ANALOG_RISK",
  REJECT: "REJECT",
} as const;
export const MOVE = { IN: "IN", OUT: "OUT", ADJUST: "ADJUST" } as const;

/** Права в программе: ADMIN заводит пользователей, USER работает со своими объектами. */
export const USER_ROLE = { USER: "USER", ADMIN: "ADMIN" } as const;
/** Права на объекте: владелец зовёт людей, инженер правит, наблюдатель только смотрит. */
export const MEMBER_ROLE = { OWNER: "OWNER", ENGINEER: "ENGINEER", VIEWER: "VIEWER" } as const;
export type MemberRole = (typeof MEMBER_ROLE)[keyof typeof MEMBER_ROLE];

export const SYSTEMS = ["ПС", "СКС", "СОТ", "АПТ", "ПЕРИМЕТР", "СОУЭ", "СКУД"] as const;
