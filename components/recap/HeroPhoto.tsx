"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { altFor, Lightbox } from "@/components/recap/Lightbox";
import { mediaAspect } from "@/lib/media";
import type { SeasonMedia } from "@/lib/queries";

// The recap's lead photo (items[0]) at full width and its own aspect ratio —
// no crop. Unknown sizes get a 4:3 frame with the photo contained. Opens the
// Lightbox over the whole gallery.
export function HeroPhoto({ items, seasonName }: { items: SeasonMedia[]; seasonName: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const hero = items[0];
  const aspect = mediaAspect(hero.width, hero.height);
  const alt = altFor(hero, seasonName);

  return (
    <figure className="space-y-2 lg:max-w-[720px]">
      <button
        ref={button}
        type="button"
        onClick={() => setIndex(0)}
        aria-label={`Open photo: ${alt}`}
        className="relative block w-full overflow-hidden rounded-lg border border-rule bg-board-3 focus-visible:outline-2 focus-visible:outline-ice"
        style={{ aspectRatio: aspect.ratio }}
      >
        <Image
          src={hero.url}
          alt={alt}
          fill
          preload
          sizes="(min-width:1024px) 720px, 100vw"
          className={aspect.known ? "object-cover" : "object-contain"}
        />
      </button>
      {hero.caption && <figcaption className="text-[14px] text-ink-dim">{hero.caption}</figcaption>}
      <Lightbox
        items={items}
        index={index}
        seasonName={seasonName}
        onIndex={setIndex}
        onClose={() => {
          setIndex(null);
          button.current?.focus();
        }}
      />
    </figure>
  );
}
