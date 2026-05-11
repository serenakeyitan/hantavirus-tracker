// Geographic-precision hierarchy and dedupe rules.
//
// Sources differ wildly in how precise their coordinates are:
//
//   1. MV Hondius line-list (ArcGIS)  — city/hospital level, hand-curated
//   2. Argentina BEN                  — province centroid
//   3. CDC NNDSS                      — US state centroid
//   4. WHO DON                        — affected-country centroid (extracted
//                                       from the outbreak post text)
//   5. GDELT                          — SOURCE country centroid (where the
//                                       publication is based, NOT where the
//                                       event happened — least meaningful)
//
// Because GDELT's lat/lng is the publication country and not the event
// country, a teal "Brazil" dot for a Brazilian outlet covering a Dutch
// cruise outbreak would falsely suggest activity in Brazil. We therefore
// suppress GDELT markers whenever a higher-precision source already
// represents that country.
//
// This rule must NOT be re-implemented inline in render code. Use these
// helpers everywhere so changes flow consistently.

import type { DataPayload, GDELTCountry } from "./types";

/**
 * The set of country names that are already represented by a higher-precision
 * source (currently WHO DON country mentions). Future sources with country-
 * level granularity should be added here — DO NOT match against the
 * Hondius line-list (which is sub-country, so its country-level overlap
 * doesn't make GDELT redundant) or Argentina BEN (which is province-level
 * and tells a different story than country-level GDELT coverage).
 */
export function countriesCoveredByHigherPrecisionSources(data: DataPayload): Set<string> {
  const out = new Set<string>();
  for (const post of data.sources.who.rows) {
    for (const c of post.countries) out.add(c.name);
  }
  return out;
}

/**
 * Split GDELT countries into "render as map markers" vs "already covered
 * elsewhere — count them in the header but don't draw a duplicate dot".
 *
 * This is the single source of truth for the dedupe decision. Both the
 * map rendering and the header counter use it.
 */
export function partitionGdeltCountries(data: DataPayload): {
  displayed: GDELTCountry[];
  suppressed: GDELTCountry[];
} {
  const higherPrecision = countriesCoveredByHigherPrecisionSources(data);
  const all = data.sources.gdelt?.countries ?? [];
  const displayed: GDELTCountry[] = [];
  const suppressed: GDELTCountry[] = [];
  for (const c of all) {
    if (higherPrecision.has(c.country)) suppressed.push(c);
    else displayed.push(c);
  }
  return { displayed, suppressed };
}
