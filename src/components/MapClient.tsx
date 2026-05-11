"use client";

import dynamic from "next/dynamic";
import type { DataPayload } from "@/lib/types";

const Map = dynamic(() => import("./Map"), { ssr: false });

export default function MapClient({ data }: { data: DataPayload }) {
  return <Map data={data} />;
}
