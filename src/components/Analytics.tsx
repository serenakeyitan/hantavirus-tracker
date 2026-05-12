"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { useEffect } from "react";

// Cloudflare Web Analytics token. Get one at
// https://dash.cloudflare.com → Web Analytics → Add a site
// Set NEXT_PUBLIC_CF_ANALYTICS_TOKEN in the Cloudflare Pages project's
// environment variables, then redeploy. Empty token → no beacon (no-op).
const CF_TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;

export default function Analytics() {
  // Inject Cloudflare beacon script after mount. Doing this in useEffect
  // (rather than via <Script>) keeps it client-only and avoids hydration
  // mismatch on the Vercel build where CF beacon shouldn't run.
  useEffect(() => {
    if (!CF_TOKEN) return;
    if (typeof window === "undefined") return;
    // Detect host — only run on the CF deploy.
    const onCf = /\.pages\.dev$/.test(window.location.hostname);
    if (!onCf) return;
    if (document.querySelector('script[data-cf-beacon]')) return;
    const s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: CF_TOKEN }));
    document.body.appendChild(s);
  }, []);

  // Vercel Analytics auto-detects the Vercel runtime and no-ops elsewhere.
  // Safe to render on all deploys.
  return <VercelAnalytics />;
}
