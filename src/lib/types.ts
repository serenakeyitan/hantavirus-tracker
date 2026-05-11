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

export type ViewMode = "outbreak" | "endemic";

export type SourceTier = "confirmed" | "reported";

export type DataPayload = {
  generatedAt: string;
  sources: {
    cdc: { name: string; url: string; tier: SourceTier; rows: StateRow[] };
    who: { name: string; url: string; tier: SourceTier; rows: WHORow[] };
  };
};
