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
  ratePer100k: number;
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
  lat: number;
  lng: number;
};

export type HondiusSource = {
  name: string;
  url: string;
  tier: SourceTier;
  counts: { confirmed: number; deceased: number; suspected: number; monitoring: number };
  cases: HondiusCase[];
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
  };
  blockedSources?: BlockedSource[];
};
