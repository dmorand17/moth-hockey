"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { altFor, Lightbox } from "@/components/recap/Lightbox";
import { mediaKind } from "@/lib/media";
import type { SeasonMedia } from "@/lib/queries";

const CAROUSEL_OVER = 6;

// The recap gallery: every photo/video after the hero (`offset`), as 4:3
// tiles — a 2-column grid on phones (3 from md), or a swipeable row on
// phones when there are more than 6. Tiles open the shared Lightbox.
export function PhotoGallery({ items, offset, seasonName }: { items: SeasonMedia[]; offset: number; seasonName: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const opener = useRef<number | null>(null);
  const shown = items.slice(offset);
  const carousel = shown.length > CAROUSEL_OVER;

  return (
    <>
      <ul
        className={
          carousel
            ? "flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:overflow-visible"
            : "grid grid-cols-2 md:grid-cols-3 gap-2"
        }
      >
        {shown.map((m, i) => {
          const video = mediaKind(m.contentType) === "video";
          const label = `Open ${video ? "video" : "photo"}: ${m.caption || (video ? `Video from ${seasonName}` : altFor(m, seasonName))}`;
          return (
            // An odd last tile spans both phone columns, so no half-empty row.
            <li
              key={m.id}
              className={`min-w-0 ${carousel ? "w-[80vw] max-w-[360px] shrink-0 snap-start md:w-auto md:max-w-none" : "max-md:[&:last-child:nth-child(odd)]:col-span-2"}`}
            >
              <button
                type="button"
                ref={(el) => {
                  tiles.current[i] = el;
                }}
                onClick={() => {
                  opener.current = i;
                  setIndex(offset + i);
                }}
                aria-label={label}
                className="relative block w-full aspect-[4/3] min-h-11 overflow-hidden rounded-md border border-rule bg-board-3 focus-visible:outline-2 focus-visible:outline-ice"
              >
                {video ? (
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
                    sizes={carousel ? "(min-width:768px) 33vw, 80vw" : "(min-width:768px) 33vw, 50vw"}
                    className="object-cover object-[50%_20%]"
                  />
                )}
              </button>
              {m.caption && <p className="mt-1 text-[14px] leading-5 text-ink-dim line-clamp-2">{m.caption}</p>}
            </li>
          );
        })}
      </ul>
      <Lightbox
        items={items}
        index={index}
        seasonName={seasonName}
        onIndex={setIndex}
        onClose={() => {
          setIndex(null);
          if (opener.current !== null) tiles.current[opener.current]?.focus();
        }}
      />
    </>
  );
}
