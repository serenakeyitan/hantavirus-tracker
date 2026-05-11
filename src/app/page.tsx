import { promises as fs } from "node:fs";
import path from "node:path";
import MapClient from "@/components/MapClient";
import type { DataPayload } from "@/lib/types";

async function loadData(): Promise<DataPayload> {
  const file = path.join(process.cwd(), "public", "data.json");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export default async function Home() {
  const data = await loadData();
  const stateCount = data.sources.cdc.rows.length;
  const totalUSCases = data.sources.cdc.rows.reduce((a, r) => a + r.total, 0);
  const whoCount = data.sources.who.rows.length;
  const generated = new Date(data.generatedAt).toUTCString();

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Hantavirus Tracker</h1>
            <p className="text-sm text-zinc-600">
              Live surveillance map &middot; CDC NNDSS (US) + WHO Disease Outbreak News (global)
            </p>
          </div>
          <p className="text-xs text-zinc-500">Data refreshed {generated}</p>
        </div>
      </header>

      <section className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="inline-block h-3 w-3 rounded-full bg-red-600 align-middle" />{" "}
            <b>{totalUSCases.toLocaleString()}</b> US cases across <b>{stateCount}</b> states (last 3 years)
          </div>
          <div>
            <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-blue-700 align-middle" />{" "}
            <b>{whoCount}</b> active WHO outbreak posts
          </div>
        </div>
      </section>

      <main className="relative flex-1">
        <MapClient data={data} />
      </main>

      <footer className="border-t border-zinc-200 bg-white px-6 py-3 text-xs text-zinc-500">
        <div className="mx-auto max-w-6xl">
          Sources:{" "}
          <a href={data.sources.cdc.url} className="underline" target="_blank" rel="noopener">CDC NNDSS</a>{" "}&middot;{" "}
          <a href={data.sources.who.url} className="underline" target="_blank" rel="noopener">WHO DON</a>{" "}&middot;{" "}
          Not a medical resource. For public health information consult your local authority.
        </div>
      </footer>
    </div>
  );
}
