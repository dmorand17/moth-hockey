"use client";

import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import { altFor, Lightbox } from "@/components/recap/Lightbox";
import type { SeasonMedia } from "@/lib/queries";

// Square photo/video tiles that open the Lightbox (admin manager view).
// `tileExtra` renders under a tile (the admin controls).
export function MediaGrid({
  items,
  seasonName,
  tileExtra,
}: {
  items: SeasonMedia[];
  seasonName: string;
  tileExtra?: (m: SeasonMedia, i: number) => ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const opener = useRef<number | null>(null);

  const open = (i: number) => {
    opener.current = i;
    setIndex(i);
  };
  const onClose = () => {
    setIndex(null);
    if (opener.current !== null) tiles.current[opener.current]?.focus();
  };

  return (
    <>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map((m, i) => (
          <li key={m.id} className="min-w-0">
            <button
              type="button"
              ref={(el) => {
                tiles.current[i] = el;
              }}
              onClick={() => open(i)}
              aria-label={`Open ${m.contentType.startsWith("video/") ? "video" : "photo"} ${i + 1} of ${items.length}${m.caption ? `: ${m.caption}` : ""}`}
              className="relative block w-full aspect-square overflow-hidden rounded-md border border-rule bg-board-3 focus-visible:outline-2 focus-visible:outline-ice"
            >
              {m.contentType.startsWith("video/") ? (
                <>
                  <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                  <span aria-hidden className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[12px] font-semibold text-white">
                    ▶ Video
                  </span>
                </>
              ) : (
                <Image
                  src={m.url}
                  alt={altFor(m, seasonName)}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
              )}
            </button>
            {tileExtra?.(m, i)}
          </li>
        ))}
      </ul>

      <Lightbox items={items} index={index} seasonName={seasonName} onIndex={setIndex} onClose={onClose} />
    </>
  );
}
