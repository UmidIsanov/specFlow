import { PrismaClient } from "@prisma/client";
import { matchOfferItem, type Candidate } from "../src/lib/match.js";

const prisma = new PrismaClient();

const SPEC = [
  { pos: "1", system: "ПС", name: "Извещатель пожарный дымовой оптико-электронный адресный", article: "ИП 212-64", manufacturer: "Рубеж", unit: "шт", qtyPlan: 412, pricePlan: 185000 },
  { pos: "2", system: "ПС", name: "Извещатель пожарный ручной адресный", article: "ИПР 513-11", manufacturer: "Рубеж", unit: "шт", qtyPlan: 46, pricePlan: 165000 },
  { pos: "3", system: "ПС", name: "Прибор приёмно-контрольный охранно-пожарный", article: "Рубеж-2ОП прот.R3", manufacturer: "Рубеж", unit: "шт", qtyPlan: 2, pricePlan: 6100000 },
  { pos: "4", system: "ПС", name: "Источник вторичного электропитания резервированный 12В 2А", article: "РИП-12 исп.01", manufacturer: "Болид", unit: "шт", qtyPlan: 18, pricePlan: 1250000 },
  { pos: "5", system: "ПС", name: "Аккумуляторная батарея 12В 7Ач", article: "DTM 1207", manufacturer: "Delta", unit: "шт", qtyPlan: 36, pricePlan: 320000 },
  { pos: "6", system: "СОУЭ", name: "Оповещатель охранно-пожарный светозвуковой 12В", article: "Маяк-12-3М", manufacturer: "Электротехника", unit: "шт", qtyPlan: 64, pricePlan: 145000 },
  { pos: "7", system: "ПС", name: "Кабель огнестойкий КПСЭнг(А)-FRLS 1x2x0.75", article: "КПСЭнг(А)-FRLS 1x2x0.75", manufacturer: "Спецкабель", unit: "м", qtyPlan: 18400, pricePlan: 9800 },
  { pos: "8", system: "СКС", name: "Кабель витая пара U/UTP cat.5e 4x2x0.52 внутренний", article: "UTP4-C5E-SOLID", manufacturer: "Hyperline", unit: "м", qtyPlan: 12500, pricePlan: 6200 },
  { pos: "9", system: "СКС", name: "Шкаф телекоммуникационный настенный 19\" 15U", article: "TWB-1566-GP-RAL9004", manufacturer: "Hyperline", unit: "шт", qtyPlan: 6, pricePlan: 4300000 },
  { pos: "10", system: "СКС", name: "Патч-панель 19\" 24 порта cat.5e", article: "PP3-19-24-8P8C-C5E", manufacturer: "Hyperline", unit: "шт", qtyPlan: 12, pricePlan: 780000 },
  { pos: "11", system: "СОТ", name: "Видеокамера IP купольная 4МП с ИК-подсветкой", article: "DS-2CD2143G2-IS", manufacturer: "Hikvision", unit: "шт", qtyPlan: 88, pricePlan: 2450000 },
  { pos: "12", system: "СОТ", name: "Видеорегистратор сетевой 32-канальный", article: "DS-7732NI-K4", manufacturer: "Hikvision", unit: "шт", qtyPlan: 3, pricePlan: 9800000 },
  { pos: "13", system: "СОТ", name: "Жёсткий диск 8ТБ для видеонаблюдения", article: "WD84PURZ", manufacturer: "WD", unit: "шт", qtyPlan: 12, pricePlan: 3100000 },
  { pos: "14", system: "ПЕРИМЕТР", name: "Извещатель охранный радиоволновый линейный, дальность 200 м", article: "ФОРТЕЗА-200", manufacturer: "Охранная техника", unit: "шт", qtyPlan: 14, pricePlan: 5600000 },
  { pos: "15", system: "АПТ", name: "Модуль газового пожаротушения 40 л", article: "МПТУ 150-40-12", manufacturer: "Пожтехника", unit: "шт", qtyPlan: 8, pricePlan: 14500000 },
];

// КП «Технопрогресс» — почти всё в проекте, часть аналогами
const OFFER_A = [
  { rawName: "Извещатель пожарный дымовой адресный ИП212-64", article: "ИП212-64", manufacturer: "Рубеж", unit: "шт", qty: 412, price: 179000 },
  { rawName: "Извещатель пожарный ручной ИПР 513-11", article: "ИПР513-11", manufacturer: "Рубеж", unit: "шт", qty: 46, price: 158000 },
  { rawName: "ППКОП Рубеж-2ОП протокол R3", article: "Рубеж-2ОП R3", manufacturer: "Рубеж", unit: "шт", qty: 2, price: 6250000 },
  { rawName: "Источник питания резервированный РИП-12 исп.01 12В 2А", article: "РИП-12 исп.01", manufacturer: "Болид", unit: "шт", qty: 18, price: 1190000 },
  { rawName: "Аккумулятор 12В 7.2Ач", article: "HR1234W", manufacturer: "CSB", unit: "шт", qty: 36, price: 298000 },
  { rawName: "Оповещатель светозвуковой Маяк-12-3М", article: "Маяк-12-3М", manufacturer: "Электротехника", unit: "шт", qty: 64, price: 141000 },
  { rawName: "Кабель КПСЭнг(А)-FRLS 1x2x0.75", article: "КПСЭНГ(А)-FRLS 1X2X0.75", manufacturer: "Спецкабель", unit: "м", qty: 18400, price: 9450 },
  { rawName: "Кабель UTP cat.5e 4 пары внутренний", article: "UTP4-C5E-SOLID", manufacturer: "Hyperline", unit: "м", qty: 12500, price: 5900 },
  { rawName: "Шкаф настенный 19 дюймов 15U", article: "TWB-1566-GP-RAL9004", manufacturer: "Hyperline", unit: "шт", qty: 6, price: 4180000 },
  { rawName: "Патч-панель 19\" 24 порта категория 5e", article: "PP3-19-24-8P8C-C5E", manufacturer: "Hyperline", unit: "шт", qty: 12, price: 760000 },
  { rawName: "Видеокамера IP купольная 4МП DS-2CD2143G2-IS", article: "DS-2CD2143G2-IS", manufacturer: "Hikvision", unit: "шт", qty: 88, price: 2390000 },
  { rawName: "Видеорегистратор 32 канала DS-7732NI-K4", article: "DS-7732NI-K4", manufacturer: "Hikvision", unit: "шт", qty: 3, price: 9600000 },
  { rawName: "HDD 8TB Purple для видеонаблюдения", article: "WD84PURZ", manufacturer: "WD", unit: "шт", qty: 12, price: 2980000 },
  { rawName: "Извещатель радиоволновый ФОРТЕЗА-200", article: "ФОРТЕЗА-200", manufacturer: "Охранная техника", unit: "шт", qty: 14, price: 5490000 },
];

// КП «Мехнат Савдо» — дешевле, но много аналогов и недопоставка
const OFFER_B = [
  { rawName: "Извещатель дымовой адресный ИП 212-64 ПРОФИ", article: "ИП212-64 ПРОФИ", manufacturer: "Рубеж", unit: "шт", qty: 412, price: 168000 },
  { rawName: "Извещатель ручной ИПР 513-3АМ", article: "ИПР513-3АМ", manufacturer: "Болид", unit: "шт", qty: 46, price: 132000 },
  { rawName: "Прибор приёмно-контрольный Рубеж-2ОП", article: "Рубеж-2ОП", manufacturer: "Рубеж", unit: "шт", qty: 2, price: 5900000 },
  { rawName: "Блок питания резервированный 12В 1А РИП-12 исп.02", article: "РИП-12 исп.02", manufacturer: "Болид", unit: "шт", qty: 18, price: 940000 },
  { rawName: "Аккумуляторная батарея 12В 7Ач DTM 1207", article: "DTM1207", manufacturer: "Delta", unit: "шт", qty: 36, price: 285000 },
  { rawName: "Оповещатель светозвуковой 24В Маяк-24-3М", article: "Маяк-24-3М", manufacturer: "Электротехника", unit: "шт", qty: 64, price: 138000 },
  { rawName: "Кабель КПСнг(А)-FRLS 1x2x0.75 (без экрана)", article: "КПСнг(А)-FRLS 1x2x0.75", manufacturer: "Спецкабель", unit: "м", qty: 18400, price: 7900 },
  { rawName: "Кабель UTP 5e 4x2x0.51 CCA внутренний", article: "UTP4-C5E-CCA", manufacturer: "NoName", unit: "м", qty: 12500, price: 3700 },
  { rawName: "Шкаф настенный 19\" 12U", article: "TWB-1265-GP-RAL9004", manufacturer: "Hyperline", unit: "шт", qty: 6, price: 3650000 },
  { rawName: "Видеокамера IP купольная 2МП DS-2CD2123G2-IS", article: "DS-2CD2123G2-IS", manufacturer: "Hikvision", unit: "шт", qty: 88, price: 1750000 },
  { rawName: "Видеорегистратор 32 канала DS-7732NI-K4", article: "DS-7732NI-K4", manufacturer: "Hikvision", unit: "шт", qty: 2, price: 9400000 },
  { rawName: "Модуль газового пожаротушения 40л МПТУ 150-40-12", article: "МПТУ 150-40-12", manufacturer: "Пожтехника", unit: "шт", qty: 8, price: 13900000 },
];

async function analyze(offerId: string, projectId: string) {
  const spec = await prisma.specItem.findMany({ where: { projectId } });
  const candidates: Candidate[] = spec.map((s) => ({
    id: s.id, name: s.name, article: s.article, manufacturer: s.manufacturer, unit: s.unit,
  }));
  const items = await prisma.offerItem.findMany({ where: { offerId } });
  for (const item of items) {
    const r = matchOfferItem(
      { id: item.id, name: item.rawName, article: item.article, manufacturer: item.manufacturer, unit: item.unit },
      candidates
    );
    await prisma.offerItem.update({
      where: { id: item.id },
      data: {
        specItemId: r.specItemId,
        matchType: r.matchType,
        matchScore: r.matchScore,
        verdict: r.verdict,
        analysisJson: JSON.stringify({ reasons: r.reasons, paramDiffs: r.paramDiffs }),
      },
    });
  }
  await prisma.offer.update({ where: { id: offerId }, data: { status: "ANALYZED" } });
}

async function main() {
  await prisma.stockMove.deleteMany();
  await prisma.workActItem.deleteMany();
  await prisma.workAct.deleteMany();
  await prisma.deliveryItem.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.offerItem.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.deviation.deleteMany();
  await prisma.specItem.deleteMany();
  await prisma.project.deleteMany();
  await prisma.supplier.deleteMany();

  const project = await prisma.project.create({
    data: {
      name: "АБК медеплавильного завода — слаботочные системы",
      code: "АГМК-МПЗ-2026",
      customer: "АО «Алмалыкский ГМК»",
      address: "г. Алмалык, промплощадка МПЗ",
    },
  });

  await prisma.specItem.createMany({ data: SPEC.map((s) => ({ ...s, projectId: project.id })) });

  const supplierA = await prisma.supplier.create({ data: { name: "ООО «Технопрогресс»", contact: "+998 90 123-45-67" } });
  const supplierB = await prisma.supplier.create({ data: { name: "ООО «Мехнат Савдо»", contact: "+998 91 765-43-21" } });

  const offerA = await prisma.offer.create({
    data: { projectId: project.id, supplierId: supplierA.id, number: "КП-114/26", deliveryDays: 30, items: { create: OFFER_A } },
  });
  const offerB = await prisma.offer.create({
    data: { projectId: project.id, supplierId: supplierB.id, number: "КП-08-26", deliveryDays: 14, items: { create: OFFER_B } },
  });
  await analyze(offerA.id, project.id);
  await analyze(offerB.id, project.id);

  const spec = await prisma.specItem.findMany({ where: { projectId: project.id } });
  const byArticle = new Map(spec.map((s) => [s.article ?? s.name, s]));
  const pick = (article: string, qty: number) => ({ specItemId: byArticle.get(article)!.id, qty });

  const delivery = await prisma.delivery.create({
    data: {
      projectId: project.id,
      supplierId: supplierA.id,
      number: "П-1",
      waybill: "ТТН 4417",
      note: "Первая партия — 1-й и 2-й этаж",
      items: {
        create: [
          pick("ИП 212-64", 220),
          pick("ИПР 513-11", 30),
          pick("РИП-12 исп.01", 10),
          pick("DTM 1207", 20),
          pick("КПСЭнг(А)-FRLS 1x2x0.75", 9000),
          pick("DS-2CD2143G2-IS", 40),
        ],
      },
    },
    include: { items: true },
  });
  await prisma.stockMove.createMany({
    data: delivery.items.map((i) => ({
      projectId: project.id, specItemId: i.specItemId, qty: i.qty, type: "IN", refType: "DELIVERY", refId: delivery.id,
    })),
  });

  const act = await prisma.workAct.create({
    data: {
      projectId: project.id,
      number: "АОСР-03",
      location: "Блок А, 1 этаж, оси 1-12",
      system: "ПС",
      status: "SIGNED",
      signedAt: new Date(),
      items: {
        create: [
          pick("ИП 212-64", 138),
          pick("ИПР 513-11", 14),
          pick("РИП-12 исп.01", 5),
          pick("КПСЭнг(А)-FRLS 1x2x0.75", 5200),
        ],
      },
    },
    include: { items: true },
  });
  await prisma.stockMove.createMany({
    data: act.items.map((i) => ({
      projectId: project.id, specItemId: i.specItemId, qty: -i.qty, type: "OUT", refType: "ACT", refId: act.id,
      comment: "Списание по акту АОСР-03",
    })),
  });

  await prisma.workAct.create({
    data: {
      projectId: project.id,
      number: "АОСР-04",
      location: "Блок А, 2 этаж",
      system: "СОТ",
      status: "DRAFT",
      items: { create: [pick("DS-2CD2143G2-IS", 22)] },
    },
  });

  await prisma.deviation.create({
    data: {
      projectId: project.id,
      specItemId: byArticle.get("DTM 1207")!.id,
      kind: "REPLACE",
      description: "АКБ Delta DTM 1207 заменён на CSB HR1234W (12В 7.2Ач) — согласовано с проектным институтом, характеристики не хуже проектных.",
      approvedBy: "ГИП Ш. Каримов",
    },
  });

  console.log("Готово: объект, спецификация (15 поз.), 2 КП, поставка, 2 акта.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
