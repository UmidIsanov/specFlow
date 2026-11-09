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

/** Состояние участка ИТД: как приняли работы по реестру инспекций. */
export const ITD_STATE = {
  ACCEPTED: "ACCEPTED", // сдано
  PARTIAL: "PARTIAL", // сдано частично: этаж, участок
  REMARKS: "REMARKS", // идёт устранение замечаний
  REQUESTED: "REQUESTED", // инспекция запрошена, статуса ещё нет
} as const;
export type ItdState = (typeof ITD_STATE)[keyof typeof ITD_STATE];

/** Пакеты работ: оборудование — один пакет, трассы и кабель — другой. */
export const ITD_PACK = { EQUIP: "EQUIP", CABLE: "CABLE", OTHER: "OTHER" } as const;
export type ItdPack = (typeof ITD_PACK)[keyof typeof ITD_PACK];

export const SYSTEMS = ["ПС", "СКС", "СОТ", "АПТ", "ПЕРИМЕТР", "СОУЭ", "СКУД"] as const;
