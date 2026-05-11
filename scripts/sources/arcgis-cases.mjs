// ArcGIS Feature Server — individual line-list of cases for the MV Hondius
// Andes-virus cluster, maintained by K. Panozzo, University of Toledo.
//
// This is the highest-resolution data source we have for the cruise outbreak:
// each case is its own row with status (CONFIRMED/SUSPECTED/DECEASED/MONITORING),
// last-known location (city-level lat/lng), a primary-source URL, and free-text
// narrative. The Feature Server is public, no auth, no apparent rate limit.

const UA = "hantavirus-tracker/0.1 (+https://github.com/serenakeyitan/hantavirus-tracker)";
const FEATURE_URL =
  "https://services1.arcgis.com/wb4Og4gH5mvzQAIV/arcgis/rest/services/Tracking_Hantavirus_2026/FeatureServer/1/query";

export async function fetchArcgisCases() {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    outFields: "*",
    outSR: "4326",
    resultRecordCount: "500",
  });
  const url = `${FEATURE_URL}?${params}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`ArcGIS ${res.status}`);
  const json = await res.json();

  const cases = (json.features ?? [])
    .map(feat => {
      const p = feat.properties ?? {};
      const g = feat.geometry?.coordinates;
      if (!g || g.length < 2) return null;
      const [lng, lat] = g;
      const status = String(p.STATUS ?? "").toUpperCase();
      // Normalize the four canonical statuses; anything else gets folded into MONITORING.
      const normStatus =
        status === "CONFIRMED" || status === "DECEASED" || status === "SUSPECTED" || status === "MONITORING"
          ? status
          : "MONITORING";
      return {
        caseId: p.CASE_ ?? p.OBJECTID ?? null,
        status: normStatus,
        details: (p.DETAILS ?? "").trim(),
        location: (p.LASTLOCATION ?? "").trim(),
        sourceUrl: (p.SOURCE ?? "").trim() || null,
        exposureGroup: (p.Exposure_Group ?? "").trim() || null,
        onset: p.ONSET ? new Date(p.ONSET).toISOString() : null,
        lat,
        lng,
      };
    })
    .filter(Boolean);

  const counts = {
    confirmed: cases.filter(c => c.status === "CONFIRMED").length,
    deceased: cases.filter(c => c.status === "DECEASED").length,
    suspected: cases.filter(c => c.status === "SUSPECTED").length,
    monitoring: cases.filter(c => c.status === "MONITORING").length,
  };

  return {
    name: "MV Hondius case line-list (K. Panozzo, University of Toledo)",
    sourceUrl: "https://www.arcgis.com/apps/dashboards/5c68442d2afc42d7ba2696e4cd393729",
    featureServerUrl: FEATURE_URL,
    fetchedAt: new Date().toISOString(),
    counts,
    cases,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchArcgisCases()
    .then(d => {
      console.log("Counts:", d.counts);
      console.log("Cases (first 10):");
      for (const c of d.cases.slice(0, 10)) {
        console.log(`  #${c.caseId} ${c.status.padEnd(10)} ${c.location.padEnd(20)} ${c.details.slice(0, 60)}`);
      }
    })
    .catch(e => { console.error(e); process.exit(1); });
}
