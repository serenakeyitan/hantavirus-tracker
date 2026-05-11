// GDELT DOC API 2.0 — global news media aggregation, free, no auth, well-documented.
// We pull last 14 days of hantavirus-tagged articles across all languages and
// surface them as "reported" tier signals (lower trust than official surveillance).
//
// Notes on shape:
//  - GDELT enforces 1 request/5s. We make exactly one call per cron run.
//  - sourcecountry = where the publication is based (not always where the event is).
//  - We dedupe by URL and filter out a handful of low-quality domains.
//  - Title-level keyword filter trims obvious off-topic noise.

const UA = "hantavirus-tracker/0.1 (+https://github.com/serenakeyitan/hantavirus-tracker)";

// Country centroids for `sourcecountry` geocoding. Hantavirus reporting comes from
// a long tail of countries — keep this list aligned with the WHO geocoder.
const COUNTRY_CENTROIDS = {
  "United States": [39.0, -98.0],
  "United Kingdom": [54.0, -2.4],
  Canada: [56.1, -106.3],
  Brazil: [-14.2, -51.9],
  Argentina: [-38.4, -63.6],
  Chile: [-35.7, -71.5],
  Mexico: [23.6, -102.5],
  Spain: [40.5, -3.7],
  Portugal: [39.4, -8.2],
  France: [46.2, 2.2],
  Germany: [51.2, 10.5],
  Italy: [41.9, 12.6],
  Netherlands: [52.1, 5.3],
  Switzerland: [46.8, 8.2],
  Austria: [47.5, 14.6],
  Belgium: [50.5, 4.5],
  Ireland: [53.1, -7.7],
  Turkey: [38.96, 35.24],
  Bulgaria: [42.7, 25.5],
  Hungary: [47.2, 19.5],
  Romania: [45.9, 25.0],
  Poland: [51.9, 19.1],
  Ukraine: [48.4, 31.2],
  Russia: [61.5, 105.3],
  China: [35.9, 104.2],
  Japan: [36.2, 138.3],
  "South Korea": [35.9, 127.8],
  India: [20.6, 78.96],
  Australia: [-25.3, 133.8],
  "New Zealand": [-40.9, 174.9],
  "South Africa": [-30.6, 22.9],
  Israel: [31.0, 34.85],
};

// Domains that publish opinion / clickbait / off-topic content that keeps tripping
// the hantavirus filter. Excluded preemptively.
const BLOCKED_DOMAINS = new Set([
  // none initially — populate as we observe noise
]);

const RELEVANT_RX = /hantavir|hantavírus|хантавирус|hantavirüs|sin nombre|andes virus|MV Hondius/i;

async function fetchGdeltOnce(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  return res.json();
}

export async function fetchGDELT() {
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?" +
    new URLSearchParams({
      query: "hantavirus",
      mode: "ArtList",
      format: "JSON",
      maxrecords: "100",
      timespan: "14d",
      sort: "DateDesc",
    });

  // GDELT occasionally drops connections or rate-limits (1 req/5s policy).
  // Retry with exponential backoff so a hiccup doesn't lose the whole source.
  let json;
  let lastErr;
  for (const delay of [0, 6000, 15000]) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      json = await fetchGdeltOnce(url);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!json) throw lastErr;

  const seen = new Set();
  const articles = [];
  for (const a of json.articles ?? []) {
    if (!a.url || seen.has(a.url)) continue;
    seen.add(a.url);
    const title = a.title ?? "";
    if (!RELEVANT_RX.test(title)) continue;
    if (BLOCKED_DOMAINS.has(a.domain)) continue;
    const country = (a.sourcecountry || "").trim();
    const centroid = country ? COUNTRY_CENTROIDS[country] : null;
    articles.push({
      title,
      url: a.url,
      domain: a.domain ?? null,
      language: a.language ?? null,
      sourceCountry: country || null,
      lat: centroid?.[0] ?? null,
      lng: centroid?.[1] ?? null,
      seenAt: gdeltDateToISO(a.seendate),
      socialImage: a.socialimage ?? null,
    });
  }

  // Group by source country for the map marker count.
  const byCountry = new Map();
  for (const a of articles) {
    if (!a.sourceCountry || a.lat == null) continue;
    const prev = byCountry.get(a.sourceCountry) ?? {
      country: a.sourceCountry,
      lat: a.lat,
      lng: a.lng,
      count: 0,
      latest: null,
      sampleTitles: [],
    };
    prev.count += 1;
    if (!prev.latest || a.seenAt > prev.latest) prev.latest = a.seenAt;
    if (prev.sampleTitles.length < 3) prev.sampleTitles.push({ title: a.title, url: a.url, language: a.language });
    byCountry.set(a.sourceCountry, prev);
  }

  return {
    name: "GDELT Global Knowledge Graph",
    sourceUrl: "https://api.gdeltproject.org/api/v2/doc/doc",
    fetchedAt: new Date().toISOString(),
    timespan: "14d",
    totalArticles: articles.length,
    languages: countBy(articles, a => a.language),
    countries: Array.from(byCountry.values()).sort((a, b) => b.count - a.count),
    articles, // full list (for any future feature)
  };
}

function gdeltDateToISO(s) {
  // GDELT format: "20260511T200000Z"
  if (!s || s.length < 15) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

function countBy(arr, fn) {
  const out = {};
  for (const x of arr) {
    const k = fn(x) ?? "?";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchGDELT()
    .then(d => {
      console.log(`Total relevant articles: ${d.totalArticles}`);
      console.log("Languages:", d.languages);
      console.log("Countries with signal:");
      for (const c of d.countries) {
        console.log(`  ${c.country.padEnd(20)} count=${c.count}  latest=${c.latest?.slice(0,10)}`);
        for (const t of c.sampleTitles) console.log(`     [${t.language}] ${t.title.slice(0, 80)}`);
      }
    })
    .catch(e => { console.error(e); process.exit(1); });
}
