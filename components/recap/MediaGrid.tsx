"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { stepIndex, swipeDir } from "@/lib/media";
import type { SeasonMedia } from "@/lib/queries";

const altFor = (m: SeasonMedia, seasonName: string) => m.caption || `Photo from ${seasonName}`;

// Photo/video tiles plus a full-screen lightbox (native <dialog>): swipe on
// touch, ←/→ and Escape on keyboard, focus back on the tile when it closes.
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
  const dialog = useRef<HTMLDialogElement>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const opener = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (index !== null && d && !d.open) d.showModal();
  }, [index]);

  const open = (i: number) => {
    opener.current = i;
    setIndex(i);
  };
  const step = (dir: -1 | 1) => setIndex((i) => (i === null ? i : stepIndex(i, dir, items.length)));
  const onClose = () => {
    setIndex(null);
    if (opener.current !== null) tiles.current[opener.current]?.focus();
  };

  const current = index !== null ? items[index] : null;
  const nav = "absolute top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/60 text-white text-[22px] flex items-center justify-center hover:bg-black/80";

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

      <dialog
        ref={dialog}
        onClose={onClose}
        aria-label={current ? altFor(current, seasonName) : "Media viewer"}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const dir = swipeDir(e.clientX - start.current.x, e.clientY - start.current.y);
          start.current = null;
          if (dir) step(dir);
        }}
        className="m-0 p-0 w-screen h-dvh max-w-none max-h-none bg-black text-white backdrop:bg-black open:flex flex-col"
      >
        {current && (
          <>
            <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),8px)]">
              <span className="text-[14px] tnum text-white/80">
                {index! + 1} / {items.length}
              </span>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label="Close"
                className="h-11 w-11 rounded-full text-[24px] flex items-center justify-center hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <div className="relative flex-1 min-h-0 touch-pan-y">
              {current.contentType.startsWith("video/") ? (
                <video key={current.id} src={current.url} controls autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />
              ) : (
                <Image key={current.id} src={current.url} alt={altFor(current, seasonName)} fill sizes="100vw" className="object-contain" />
              )}
              {items.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="Previous" className={`${nav} left-2`}>
                    ‹
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="Next" className={`${nav} right-2`}>
                    ›
                  </button>
                </>
              )}
            </div>
            {current.caption && <p className="px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] text-[15px] text-center">{current.caption}</p>}
          </>
        )}
      </dialog>
    </>
  );
}
