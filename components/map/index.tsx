"use client";
import dynamic from "next/dynamic";
import type { StormMapProps } from "./StormMap";

export const StormMap = dynamic<StormMapProps>(() => import("./StormMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#0a1016] grid-bg">
      <div className="flex items-center gap-2 text-sm text-mute">
        <span className="inline-block h-3 w-3 animate-ping rounded-full bg-brand" /> Loading map…
      </div>
    </div>
  ),
});

export { DEFAULT_LAYERS, type Layers, type Basemap, type PersonMarker, type TicketMarker } from "./layers";
