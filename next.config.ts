import type { NextConfig } from "next";
import path from "node:path";

// Set TARGET=cloudflare to build a static export for Cloudflare Pages.
// Vercel builds without this env var and uses its default optimized output.
const isCloudflareExport = process.env.TARGET === "cloudflare";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  ...(isCloudflareExport
    ? {
        output: "export",
        // Static export can't generate images at runtime; we don't use next/image
        // for anything, but turning this off is required when output:export is set.
        images: { unoptimized: true },
        // Cloudflare Pages serves the index of folders with no trailing slash,
        // but next/link emits /foo paths without slashes — disable trailing
        // slash mode is the default so we just leave it.
      }
    : {}),
};

export default nextConfig;
