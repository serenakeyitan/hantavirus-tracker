export type StateRow = {
  state: string;
  lat: number;
  lng: number;
  total: number;
  byYear: Record<string, number>;
};

export type WHOCountry = { name: string; lat: number; lng: number };

export type Species = "andes" | "sin-nombre" | "seoul" | "puumala" | "other";

export type WHORow = {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  url: string;
  species: Species;
  countries: WHOCountry[];
};

export type ArgentinaProvinceRow = {
  jurisdiction: string;
  region: string;
  lat: number;
  lng: number;
  cases: number;
  ratePer100k: number | null;
  isAndesRegion: boolean;
  seasonLabel: string;
};

export type ArgentinaSource = {
  name: string;
  url: string;
  bulletinIssue: number;
  tier: SourceTier;
  seasonLabel: string;
  totalCases: number;
  andesCases: number;
  rows: ArgentinaProvinceRow[];
};

export type HondiusStatus = "CONFIRMED" | "DECEASED" | "SUSPECTED" | "MONITORING";

export type HondiusCase = {
  caseId: number | null;
  status: HondiusStatus;
  details: string;
  location: string;
  sourceUrl: string | null;
  exposureGroup: string | null;
  onset: string | null;
  firstSeenAt: string | null;
  reportedDate: string | null;
  reportedDateSource: "onset" | "narrative" | "first-seen" | null;
  lat: number;
  lng: number;
};

export type DailyPoint = { day: string; count: number };

export type HondiusSource = {
  name: string;
  url: string;
  tier: SourceTier;
  counts: { confirmed: number; deceased: number; suspected: number; monitoring: number };
  cases: HondiusCase[];
  dailySeries?: DailyPoint[];
  cumulativeSeries?: DailyPoint[];
  datedCounts?: { onset: number; narrative: number; firstSeen: number; undated: number };
};

export type GDELTSampleTitle = { title: string; url: string; language: string | null };

export type GDELTCountry = {
  country: string;
  lat: number;
  lng: number;
  count: number;
  latest: string | null;
  sampleTitles: GDELTSampleTitle[];
};

export type GDELTSource = {
  name: string;
  url: string;
  tier: SourceTier;
  timespan: string;
  totalArticles: number;
  languages: Record<string, number>;
  countries: GDELTCountry[];
};

export type PahoCountry = {
  country: string;
  lat: number;
  lng: number;
  cases: number;
  deaths: number | null;
  epiWeekRange: string;
  year: number;
};

export type PahoSource = {
  name: string;
  url: string;
  tier: SourceTier;
  alertDate: string;
  alertLabel: string;
  totalCases: number;
  totalDeaths: number;
  countries: PahoCountry[];
};

export type BlockedSource = { name: string; reason: string; url: string };

export type ViewMode = "outbreak" | "endemic";

export type SourceTier = "confirmed" | "reported";

export type DataPayload = {
  generatedAt: string;
  sources: {
    cdc: { name: string; url: string; tier: SourceTier; rows: StateRow[] };
    who: { name: string; url: string; tier: SourceTier; rows: WHORow[] };
    argentina?: ArgentinaSource | null;
    hondius?: HondiusSource | null;
    gdelt?: GDELTSource | null;
    paho?: PahoSource | null;
  };
  blockedSources?: BlockedSource[];
};
