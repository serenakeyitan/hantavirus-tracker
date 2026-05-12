import Tracker from "@/components/Tracker";
import type { DataPayload } from "@/lib/types";
// JSON is bundled at build time — no filesystem read, no cwd dependency.
import dataJson from "../../public/data.json";

const data = dataJson as DataPayload;

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 md:h-dvh">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Hantavirus Tracker</h1>
          <div className="flex items-baseline gap-4">
            <a
              href="https://github.com/serenakeyitan/hantavirus-tracker"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-900"
              title="View source on GitHub — open source, MIT licensed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.78 1.19 1.78 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.78 0c2.21-1.5 3.18-1.18 3.18-1.18.63 1.59.23 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/>
              </svg>
              <span>Source</span>
            </a>
            <RelativeRefreshed iso={data.generatedAt} />
          </div>
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
