export type Verdict = "PENDING" | "OK" | "ANALOG_OK" | "ANALOG_RISK" | "REJECT";
export type MatchType = "EXACT" | "ANALOG" | "NONE";

export type Project = {
  id: string;
  name: string;
  code: string | null;
  customer: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  _count?: { specItems: number; offers: number; deliveries: number; acts: number; deviations?: number };
};

export type SpecItem = {
  id: string;
  pos: string | null;
  system: string;
  name: string;
  article: string | null;
  code: string | null;
  manufacturer: string | null;
  unit: string;
  qtyPlan: number;
  pricePlan: number | null;
  note: string | null;
  section: string | null;
  building: string | null;
  docRef: string | null;
  tag: string | null;
  datasheet: string | null;
};

export type AuditLine = {
  id: string;
  pos: string | null;
  name: string;
  datasheet: string | null;
  qty: number;
  price: number;
  total: number;
  tagsListed: number;
  matchedCount: number;
  outsideCount: number;
  datasheetMismatch: number;
  qtyVsTags: number | null;
  verdict: "MATCH" | "PARTIAL" | "OUTSIDE" | "NO_TAGS";
  outside: string[];
  matchedSample: string[];
};

export type AuditScope = {
  hasSections: boolean;
  request: {
    systemPositions: { tag: string | null; name: string; qty: number }[];
    objects: { object: string; tags: number; families: { family: string; count: number }[] }[];
  };
  offer: {
    systems: { name: string; lines: number; qty: number; sum: number; di: number; do: number; ai: number; ao: number; controllers: number }[];
    hmi: number;
  };
};

export type TagAudit = {
  offers: { id: string; supplier: string; number: string | null; currency: string }[];
  scope: AuditScope;
  offer: {
    id: string;
    supplier: string;
    number: string | null;
    currency: string;
    deliveryDays: number | null;
    lines: number;
    qtyTotal: number;
    sum: number;
  };
  request: { positions: number; tagged: number; untagged: number; qtyTotal: number };
  summary: {
    tagsOffered: number;
    coveredFromRequest: number;
    notOffered: number;
    outsideRequest: number;
    linesWithoutTags: number;
    linesOutside: number;
    linesPartial: number;
    qtyMismatchLines: number;
    datasheetMismatchLines: number;
    duplicatedTags: number;
  };
  lines: AuditLine[];
  notOffered: {
    specItemId: string;
    pos: string | null;
    tag: string | null;
    name: string;
    qty: number;
    unit: string;
    datasheet: string | null;
  }[];
  duplicated: { tag: string; times: number; lines: string[] }[];
};

export type Supplier = { id: string; name: string; contact: string | null };

export type OfferStats = {
  lines: number;
  exact: number;
  analog: number;
  unmatched: number;
  risky: number;
  total: number;
};

export type Offer = {
  id: string;
  number: string | null;
  currency: string;
  deliveryDays: number | null;
  status: string;
  date: string;
  supplier: Supplier;
  stats: OfferStats;
};

export type Analysis = {
  reasons: string[];
  paramDiffs: { unit: string; spec: number | null; offer: number | null; status: string }[];
};

export type OfferItem = {
  id: string;
  rawPos: string | null;
  rawName: string;
  article: string | null;
  code: string | null;
  manufacturer: string | null;
  unit: string;
  qty: number;
  price: number;
  matchType: MatchType;
  matchScore: number;
  verdict: Verdict;
  engineerComment: string | null;
  analysisJson: string | null;
  specItem: SpecItem | null;
};

export type OfferFull = {
  id: string;
  number: string | null;
  currency: string;
  deliveryDays: number | null;
  status: string;
  supplier: Supplier;
  items: OfferItem[];
};

export type ComparisonCell = {
  offerItemIds: string[];
  name: string;
  article: string | null;
  manufacturer: string | null;
  qty: number;
  unitPrice: number;
  total: number;
  verdict: Verdict;
  matchType: MatchType;
  coverage: number | null;
  analysis: Analysis | null;
  code: string | null;
} | null;

export type SheetInfo = {
  name: string;
  rows: number;
  columns: string[];
};

export type WorkbookInfo = {
  recommended: string;
  sheets: SheetInfo[];
};

export type Comparison = {
  specCount: number;
  specRowCount: number;
  offers: {
    id: string;
    supplier: string;
    number: string | null;
    currency: string;
    deliveryDays: number | null;
    status: string;
    covered: number;
    missing: number;
    risky: number;
    shortfall: number;
    total: number;
    recommendedCount: number;
  }[];
  rows: {
    specItem: Pick<SpecItem, "id" | "pos" | "system" | "section" | "name" | "article" | "code" | "unit" | "qtyPlan">;
    buildings: { building: string; qtyPlan: number }[];
    cells: Record<string, ComparisonCell>;
    recommendedOfferId: string | null;
  }[];
};

export type PlanFactRow = {
  specItemId: string;
  pos: string | null;
  system: string;
  name: string;
  article: string | null;
  unit: string;
  qtyPlan: number;
  delivered: number;
  installed: number;
  inProgress: number;
  stock: number;
  toOrder: number;
  remaining: number;
  progress: number;
};

export type PlanFact = {
  rows: PlanFactRow[];
  totals: { positions: number; positionsDone: number; positionsNotOrdered: number; progress: number };
};

export type Delivery = {
  id: string;
  number: string | null;
  waybill: string | null;
  date: string;
  note: string | null;
  supplier: Supplier | null;
  items: { id: string; qty: number; specItem: SpecItem }[];
};

export type WorkAct = {
  id: string;
  number: string | null;
  date: string;
  location: string | null;
  system: string;
  status: "DRAFT" | "SIGNED";
  signedAt: string | null;
  items: { id: string; qty: number; specItem: SpecItem }[];
  project?: Project;
};

export type Deviation = {
  id: string;
  kind: "REPLACE" | "QTY_CHANGE" | "EXCLUDE" | "ADD";
  description: string;
  approvedBy: string | null;
  date: string;
  specItem: SpecItem | null;
};
