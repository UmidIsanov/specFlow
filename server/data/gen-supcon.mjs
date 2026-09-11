import { writeFileSync } from "node:fs";
// Блоки одинаковы по составу, отличаются только количеством I/O.
const B = [
  { dcdc:10, rack:5, im:10, di:14, db37:29, do:5,  ai:10, empty:6,  relay:70,  hart:5,  contrix:true },
  { dcdc:12, rack:6, im:12, di:20, db37:41, do:9,  ai:12, empty:7,  relay:143, hart:6,  contrix:true },
  { dcdc:12, rack:6, im:12, di:12, db37:36, do:7,  ai:17, empty:8,  relay:101, hart:9 },
  { dcdc:8,  rack:4, im:8,  di:0,  db37:13, do:3,  ai:10, empty:7,  relay:39,  hart:5 },
  { dcdc:8,  rack:4, im:8,  di:5,  db37:12, do:4,  ai:3,  empty:10, relay:50,  hart:2 },
  { dcdc:6,  rack:3, im:6,  di:0,  db37:4,  do:2,  ai:2,  empty:4,  relay:21,  hart:6 },
  { dcdc:10, rack:5, im:10, di:0,  db37:28, do:17, ai:11, empty:10, relay:263, hart:7 },
  { dcdc:12, rack:6, im:12, di:13, db37:41, do:9,  ai:19, empty:6,  relay:144, hart:10 },
];
const items = [];
let pos = 0;
const add = (section, name, article, qty, price) => { if (qty > 0) items.push({ pos: ++pos, section, name, article, qty, price, unit: "шт" }); };
B.forEach((b, i) => {
  const hw = `Система ${i + 1} · Hardware`, sw = `Система ${i + 1} · Software`, cab = `Система ${i + 1} · Cabinet`;
  add(hw, "Safety controller / Контроллер безопасности", "GCU5002F", 2, 1103);
  add(hw, "Safety co-processor / Сопроцессор безопасности", "SCP5002F", 2, 2941);
  add(hw, "Optical module / Оптический модуль", "OEO-M8-02-13-I(ZK)", 4, 25);
  add(hw, "Single-mode fiber jumper cable 0.95m LC-LC / Патч-корд оптический", "single-mode fiber 0.95m", 2, 15);
  add(hw, "AC/DC Power Module / Блок питания AC/DC 24V 20A", "PW733W", 4, 294);
  add(hw, "Power diagnosis module / Модуль диагностики питания 480W", "PW704", 4, 412);
  add(hw, "DC/DC Safety Power Module / Модуль безопасного питания 240W SIL3", "PW5010DCF", b.dcdc, 147);
  add(hw, "Rack (14 slots) / Корзина 14 слотов", "CN5014F", b.rack, 257);
  add(hw, "Extend the connection module / Модуль расширения связи", "IM5002RJF", b.im, 360);
  add(hw, "DI Module (16-channel) / Модуль дискретного ввода 16 каналов SIL3", "DI5016F", b.di, 625);
  add(hw, "Safety DI Terminal Block / Клеммный блок DI", "TU5016DIF", b.di, 37);
  add(hw, "DB37 Cable 2m / Кабель DB37", "LE37-G5Pro(F)-02", b.db37, 35);
  add(hw, "DO Module (16-channel) / Модуль дискретного вывода 16 каналов SIL3", "DO5016F", b.do, 647);
  add(hw, "Safety DO Terminal Block / Клеммный блок DO", "TU5016DOF", b.do, 34);
  add(hw, "AI Module (8-channel) / Модуль аналогового ввода 8 каналов 4-20mA SIL3", "AI5008F-H", b.ai, 735);
  add(hw, "Safety AI Current-type Terminal Block / Клеммный блок AI", "TU5008AIF", b.ai, 38);
  add(hw, "G5pro empty module / Пустой модуль", "AM5000", b.empty, 15);
  add(hw, "Weidmüller relay with LED and socket / Реле Weidmüller 2NO+2NC 24VDC", "DRM270024L + FS 2CO ECO", b.relay, 5);
  add(hw, "Hart Multiplexer / Мультиплексор HART", "HUX-MUX", b.hart, 460);
  add(hw, "Baseboard bus terminal / Шинный терминал базовой платы", "ME 22.5 TBUS", 1, 15);
  add(hw, "Baseboard wiring terminals / Клеммы подключения базовой платы", "IMC 1.5-3.81, MC 1.5-3.81", 1, 15);
  if (b.contrix) add(sw, "Contrix Plus(GCS)-S0F — ПО поддержки системы безопасности G5Pro", "Contrix Plus(GCS)-S0F", 1, 1471);
  add(sw, "I-SCADA Configuration Management Software 1000 points / ПО управления конфигурацией", "I-SCADA-DEV(1000)", 1, 794);
  add(sw, "Engineer Workstation / Инженерная рабочая станция Dell T3680, i5-14600K, 16G, 1TB SSD", "Dell T3680_16G_Single SSD", 1, 1543);
  add(sw, "DELL Display 22\" 1920×1080 / Монитор DELL", "DELL 22\"LED", 1, 171);
  add(cab, "SUPCON switch (Barrier) II generation / Коммутатор SUPCON 14×RJ45 + 2 SFP", "SUP-5216", 2, 257);
  add(cab, "SFP Module single mode LC / SFP модуль", "SFP-20S", 2, 147);
  add(cab, "Fiber-Optic Splice Closure 6 ST / Волоконно-оптическая муфта", "SUP-A-06", 1, 59);
  add(cab, "System Cabinet 2100×800×800 RAL7035 / Системный шкаф", "CN011-A0", 2, 2657);
});
add("Общее", "HMI 15.6\" screen / Человеко-машинный интерфейс", "TPC1560Gi", 5, 378);
add("Общее", "Services / Услуги: содействие при строительстве, ПНР, пуске", "", 8, 13500);
add("Общее", "Packing & Delivery / Упаковка и доставка", "", 8, 960);
const total = items.reduce((s, i) => s + i.qty * i.price, 0);
const out = {
  supplier: "SUPCON TECHNOLOGY (KAZAKHSTAN) LLP",
  number: "Спецификация №1 к контракту MOF-SUPTEC-02 от 27.07.2026",
  currency: "USD", deliveryDays: 60, totalDeclared: 508770,
  note: "Страна происхождения — Китай. DAP Алмалык. Предоплата 50%, остаток 50% до отгрузки. Гарантия 12 мес. с отгрузки.",
  systems: B.map((b, i) => ({ system: i + 1, di: b.di * 16, do: b.do * 16, ai: b.ai * 8, controllers: 2, contrix: !!b.contrix })),
  items,
};
writeFileSync("data/kp-supcon-2026-07-27.json", JSON.stringify(out, null, 1));
console.log("позиций:", items.length, "| сумма по строкам:", total.toLocaleString("ru-RU"), "USD | заявлено:", (508770).toLocaleString("ru-RU"), "| сходится:", total === 508770);
