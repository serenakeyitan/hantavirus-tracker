import { promises as fs } from "node:fs";
import path from "node:path";
import Tracker from "@/components/Tracker";
import type { DataPayload } from "@/lib/types";

async function loadData(): Promise<DataPayload> {
  const file = path.join(process.cwd(), "public", "data.json");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export default async function Home() {
  const data = await loadData();
  const generated = new Date(data.generatedAt).toUTCString();

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Hantavirus Tracker</h1>
            <p className="text-sm text-zinc-600">
              Live outbreak + endemic surveillance map &middot; WHO DON + CDC NNDSS
            </p>
          </div>
          <p className="text-xs text-zinc-500">Data refreshed {generated}</p>
        </div>
      </header>

      <Tracker data={data} />

      <footer className="border-t border-zinc-200 bg-white px-6 py-3 text-xs text-zinc-500">
        <div className="mx-auto max-w-6xl">
          Sources:{" "}
          <a href={data.sources.who.url} className="underline" target="_blank" rel="noopener">WHO DON</a>{" "}&middot;{" "}
          <a href={data.sources.cdc.url} className="underline" target="_blank" rel="noopener">CDC NNDSS</a>{" "}&middot;{" "}
          Not a medical resource. For public health information consult your local authority.
        </div>
      </footer>
    </div>
  );
}
