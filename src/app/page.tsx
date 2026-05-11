import Tracker from "@/components/Tracker";
import type { DataPayload } from "@/lib/types";
// JSON is bundled at build time — no filesystem read, no cwd dependency.
import dataJson from "../../public/data.json";

const data = dataJson as DataPayload;

export default function Home() {
  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Hantavirus Tracker</h1>
          <RelativeRefreshed iso={data.generatedAt} />
        </div>
      </header>

      <Tracker data={data} />

      <footer className="border-t border-zinc-200 bg-white px-6 py-2 text-[11px] text-zinc-500">
        <div className="mx-auto max-w-6xl">
          <details>
            <summary className="cursor-pointer select-none text-zinc-600 hover:text-zinc-900">
              Data sources &amp; methodology
            </summary>
            <div className="mt-2 space-y-1.5 leading-relaxed">
              <div>
                <b>Used:</b>{" "}
                <a href={data.sources.who.url} className="underline" target="_blank" rel="noopener">WHO DON</a>
                {" · "}
                <a href={data.sources.cdc.url} className="underline" target="_blank" rel="noopener">CDC NNDSS</a>
                {data.sources.argentina && (
                  <> {" · "}<a href={data.sources.argentina.url} className="underline" target="_blank" rel="noopener">Argentina BEN #{data.sources.argentina.bulletinIssue}</a></>
                )}
                {data.sources.hondius && (
                  <> {" · "}<a href={data.sources.hondius.url} className="underline" target="_blank" rel="noopener">MV Hondius line-list (K. Panozzo)</a></>
                )}
                {data.sources.gdelt && (
                  <> {" · "}<a href="https://www.gdeltproject.org/" className="underline" target="_blank" rel="noopener">GDELT global news</a></>
                )}
              </div>
              {data.blockedSources && data.blockedSources.length > 0 && (
                <div>
                  <b>Not yet integrated (no machine-readable feed):</b>{" "}
                  {data.blockedSources.map((s, i) => (
                    <span key={s.name}>
                      {i > 0 && " · "}
                      <a href={s.url} className="underline" target="_blank" rel="noopener" title={s.reason}>{s.name}</a>
                    </span>
                  ))}
                </div>
              )}
              <div className="text-zinc-400">
                Not a medical resource. Not affiliated with any health authority.
              </div>
            </div>
          </details>
        </div>
      </footer>
    </div>
  );
}

function RelativeRefreshed({ iso }: { iso: string }) {
  // Render server-side as ISO and let CSS clamp it; client-side hydration is
  // not needed because the timestamp doesn't change without a redeploy.
  const date = new Date(iso);
  const hoursAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  let label: string;
  if (hoursAgo < 1) label = "just now";
  else if (hoursAgo === 1) label = "1h ago";
  else if (hoursAgo < 24) label = `${hoursAgo}h ago`;
  else label = `${Math.floor(hoursAgo / 24)}d ago`;
  return (
    <span className="text-[11px] text-zinc-500" title={date.toUTCString()}>
      Refreshed {label}
    </span>
  );
}
