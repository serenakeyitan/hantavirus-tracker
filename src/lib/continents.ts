// Maps Hondius line-list location strings (country names or US state names,
// uppercase) to a continent bucket. Used for the case-list panel filter.
// Unknown locations fall into "Other".

export type Continent = "Americas" | "Europe" | "Asia" | "Africa" | "Oceania" | "At sea" | "Other";

export const CONTINENT_ORDER: Continent[] = [
  "Americas",
  "Europe",
  "Asia",
  "Africa",
  "Oceania",
  "At sea",
  "Other",
];

const LOOKUP: Record<string, Continent> = {
  // At sea
  "MV HONDIUS": "At sea",
  "MV HONDUS": "At sea",
  "AT SEA": "At sea",

  // Americas
  "UNITED STATES": "Americas",
  USA: "Americas",
  "UNITED STATES OF AMERICA": "Americas",
  CANADA: "Americas",
  MEXICO: "Americas",
  BRAZIL: "Americas",
  ARGENTINA: "Americas",
  CHILE: "Americas",
  URUGUAY: "Americas",
  PERU: "Americas",
  COLOMBIA: "Americas",
  VENEZUELA: "Americas",
  BOLIVIA: "Americas",
  PARAGUAY: "Americas",
  ECUADOR: "Americas",
  "COSTA RICA": "Americas",
  PANAMA: "Americas",

  // Europe
  "UNITED KINGDOM": "Europe",
  UK: "Europe",
  IRELAND: "Europe",
  FRANCE: "Europe",
  GERMANY: "Europe",
  SPAIN: "Europe",
  PORTUGAL: "Europe",
  ITALY: "Europe",
  NETHERLANDS: "Europe",
  "THE NETHERLANDS": "Europe",
  BELGIUM: "Europe",
  SWITZERLAND: "Europe",
  ZURICH: "Europe",
  AUSTRIA: "Europe",
  POLAND: "Europe",
  HUNGARY: "Europe",
  CZECHIA: "Europe",
  ROMANIA: "Europe",
  BULGARIA: "Europe",
  GREECE: "Europe",
  SWEDEN: "Europe",
  NORWAY: "Europe",
  FINLAND: "Europe",
  DENMARK: "Europe",
  UKRAINE: "Europe",
  RUSSIA: "Europe",

  // Asia
  CHINA: "Asia",
  JAPAN: "Asia",
  "SOUTH KOREA": "Asia",
  "NORTH KOREA": "Asia",
  INDIA: "Asia",
  TURKEY: "Asia",
  ISRAEL: "Asia",

  // Africa
  "SOUTH AFRICA": "Africa",
  JOHANNESBURG: "Africa",
  "CABO VERDE": "Africa",
  "CAPE VERDE": "Africa",
  "ST HELENA": "Africa",
  "SAINT HELENA": "Africa",
  "TRISTAN DA CUNHA": "Africa",

  // Oceania
  AUSTRALIA: "Oceania",
  "NEW ZEALAND": "Oceania",
};

// US state names → Americas (separate map to keep the country list short)
const US_STATES = [
  "ALABAMA","ALASKA","ARIZONA","ARKANSAS","CALIFORNIA","COLORADO","CONNECTICUT",
  "DELAWARE","FLORIDA","GEORGIA","HAWAII","IDAHO","ILLINOIS","INDIANA","IOWA",
  "KANSAS","KENTUCKY","LOUISIANA","MAINE","MARYLAND","MASSACHUSETTS","MICHIGAN",
  "MINNESOTA","MISSISSIPPI","MISSOURI","MONTANA","NEBRASKA","NEVADA",
  "NEW HAMPSHIRE","NEW JERSEY","NEW MEXICO","NEW YORK","NORTH CAROLINA",
  "NORTH DAKOTA","OHIO","OKLAHOMA","OREGON","PENNSYLVANIA","RHODE ISLAND",
  "SOUTH CAROLINA","SOUTH DAKOTA","TENNESSEE","TEXAS","UTAH","VERMONT",
  "VIRGINIA","WASHINGTON","WEST VIRGINIA","WISCONSIN","WYOMING",
];
for (const s of US_STATES) LOOKUP[s] = "Americas";

export function continentFor(location: string | null | undefined): Continent {
  if (!location) return "Other";
  const upper = location.toUpperCase().trim();
  // Try exact match first
  if (LOOKUP[upper]) return LOOKUP[upper];
  // Then try suffix match (e.g. "NEBRASKA, USA" → strip ", USA" → "NEBRASKA")
  for (const part of upper.split(",").map(s => s.trim()).reverse()) {
    if (LOOKUP[part]) return LOOKUP[part];
  }
  return "Other";
}
