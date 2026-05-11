# Hantavirus Tracker

Live map of hantavirus cases and outbreaks, combining two authoritative sources:

- **CDC NNDSS Weekly** — US state-level confirmed cases, last 3 years.
- **WHO Disease Outbreak News** — Global outbreak posts mentioning hantavirus, geocoded by mentioned country.

The map shows two tiers:

- 🔴 **Solid red circles** — Confirmed US cases (CDC). Size scales with cumulative count.
- 🔵 **Dashed blue circles** — WHO outbreak posts. Click to read the WHO writeup.

Data refreshes daily at 07:00 UTC via GitHub Actions.

## Develop

```bash
npm install
npm run fetch-data   # populates public/data.json
npm run dev          # http://localhost:3000
```

## Architecture

- **Next.js 16 (App Router)** + Tailwind v4.
- **Leaflet** loaded dynamically client-side (no SSR), no API keys.
- **`scripts/fetch-data.mjs`** runs in GitHub Actions; writes `public/data.json` which the page reads at build time.
- **No runtime API calls from the browser** — all data is baked into the deploy.

## Data caveats

- CDC NNDSS publishes weekly with a ~1-2 week lag.
- WHO DON only publishes outbreaks of international concern; expect sparse global coverage.
- Country extraction from WHO posts is regex-based and may include false positives (a country mentioned as a reference rather than as an affected country). Click through to the source to verify.

This is not a medical resource. For public health information consult your local authority.
