"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { doubleTapZoom, lightboxGesture, mediaKind, neighbors, pinchZoom, stepIndex, swipeDir } from "@/lib/media";
import type { SeasonMedia } from "@/lib/queries";

export const altFor = (m: SeasonMedia, seasonName: string) => m.caption || `Photo from ${seasonName}`;

type Pt = { x: number; y: number };

// Full-screen media viewer on a native <dialog> (showModal gives the focus
// trap; the owner restores focus in onClose). Swipe (touch) or ←/→ to move,
// pinch or double-tap to zoom photos and drag to pan, tap the backdrop, ×
// or Escape to close. Locks page scroll while open and preloads neighbours.
export function Lightbox({
  items,
  index,
  seasonName,
  onIndex,
  onClose,
}: {
  items: SeasonMedia[];
  index: number | null;
  seasonName: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Zoom belongs to one item; switching items (or closing) starts fresh.
  const [zoomState, setZoomState] = useState({ for: -1, scale: 1, x: 0, y: 0 });
  const zoom = zoomState.for === index ? zoomState : { for: index ?? -1, scale: 1, x: 0, y: 0 };
  const setZoom = (next: (z: typeof zoom) => { scale: number; x: number; y: number }) =>
    setZoomState((prev) => ({ ...next(prev.for === index ? prev : { for: index ?? -1, scale: 1, x: 0, y: 0 }), for: index ?? -1 }));
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ start: Pt; pan: Pt; moved: number; pinch?: { dist: number; scale: number }; ignore: boolean } | null>(null);
  const lastTap = useRef(0);

  const open = index !== null;
  const current = open ? items[index] : null;
  const many = items.length > 1;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Lock page scroll behind the viewer.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const step = (dir: -1 | 1) => index !== null && many && onIndex(stepIndex(index, dir, items.length));
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const onVideo = e.target instanceof HTMLVideoElement;
    if (pointers.current.size === 2 && !onVideo) {
      gesture.current = { start: { x: e.clientX, y: e.clientY }, pan: { x: zoom.x, y: zoom.y }, moved: 99, pinch: { dist: dist(), scale: zoom.scale }, ignore: false };
    } else if (pointers.current.size === 1) {
      gesture.current = { start: { x: e.clientX, y: e.clientY }, pan: { x: zoom.x, y: zoom.y }, moved: 0, ignore: onVideo };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g || g.ignore) return;
    if (g.pinch && pointers.current.size === 2) {
      const scale = pinchZoom(g.pinch.scale, g.pinch.dist, dist());
      setZoom((z) => (scale === 1 ? { scale, x: 0, y: 0 } : { ...z, scale }));
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    if (zoom.scale > 1) setZoom((z) => ({ ...z, x: g.pan.x + dx, y: g.pan.y + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g || pointers.current.size > 0) return;
    gesture.current = null;
    if (g.ignore || g.pinch) return;

    if (g.moved <= 10) {
      const onImage = e.target instanceof HTMLImageElement;
      if (onImage) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          setZoom((z) => ({ scale: doubleTapZoom(z.scale), x: 0, y: 0 }));
          lastTap.current = 0;
        } else lastTap.current = now;
      } else if (!(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLVideoElement)) {
        dialog.current?.close(); // tap on the backdrop
      }
      return;
    }
    // A drag: pan while zoomed, otherwise a touch swipe moves between items.
    if (zoom.scale > 1) return;
    if (!lightboxGesture({ kind: "swipe", pointerType: e.pointerType, onVideo: false })) return;
    const dir = swipeDir(e.clientX - g.start.x, e.clientY - g.start.y);
    if (dir) step(dir);
  };

  const nav = "absolute top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/60 text-white text-[22px] flex items-center justify-center hover:bg-black/80";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={current ? altFor(current, seasonName) : "Media viewer"}
      onKeyDown={(e) => {
        if (!lightboxGesture({ kind: "key", onVideo: e.target instanceof HTMLVideoElement })) return;
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
      className="m-0 p-0 w-screen h-dvh max-w-none max-h-none bg-black text-white backdrop:bg-black open:flex flex-col overscroll-contain"
    >
      {current && (
        <>
          <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),8px)]">
            <span className="text-[14px] tnum text-white/80">{many ? `${index! + 1} / ${items.length}` : ""}</span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="h-11 w-11 rounded-full text-[24px] flex items-center justify-center hover:bg-white/10"
            >
              ×
            </button>
          </div>
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(e) => {
              pointers.current.delete(e.pointerId);
              gesture.current = null;
            }}
          >
            {mediaKind(current.contentType) === "video" ? (
              <video key={current.id} src={current.url} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
            ) : (
              <Image
                key={current.id}
                src={current.url}
                alt={altFor(current, seasonName)}
                width={current.width ?? 1600}
                height={current.height ?? 1200}
                sizes="100vw"
                quality={80}
                draggable={false}
                className="max-h-full max-w-full w-auto h-auto object-contain transition-transform duration-75"
                style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
              />
            )}
            {many && (
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
          {current.caption && <p className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] text-[15px] text-center">{current.caption}</p>}
          {/* Warm the cache for the photos either side. */}
          <div aria-hidden className="absolute h-px w-px overflow-hidden opacity-0 pointer-events-none">
            {neighbors(index!, items.length)
              .map((i) => items[i])
              .filter((m) => mediaKind(m.contentType) === "image")
              .map((m) => (
                <Image key={m.id} src={m.url} alt="" width={m.width ?? 1600} height={m.height ?? 1200} sizes="100vw" quality={80} loading="eager" />
              ))}
          </div>
        </>
      )}
    </dialog>
  );
}
