"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  type: string;
  label: string;
  seasons: string[]; // names of seasons the badge was earned in
};

const PALETTE: Record<string, { bg: string; border: string; fg: string; star: string }> = {
  champion:  { bg: "rgba(255, 56, 56, 0.10)",  border: "rgba(255, 56, 56, 0.45)",  fg: "var(--goal)",      star: "★" },
  mvp:       { bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.45)", fg: "#f59e0b",          star: "★" },
  mvd:       { bg: "rgba(124, 227, 240, 0.10)", border: "rgba(124, 227, 240, 0.45)", fg: "var(--ice)",      star: "★" },
  goon:      { bg: "rgba(168, 85, 247, 0.10)", border: "rgba(168, 85, 247, 0.45)", fg: "#c084fc",          star: "✪" },
  sniper:    { bg: "rgba(239, 68, 68, 0.10)",  border: "rgba(239, 68, 68, 0.45)",  fg: "#fca5a5",          star: "◎" },
  playmaker: { bg: "rgba(34, 197, 94, 0.10)",  border: "rgba(34, 197, 94, 0.45)",  fg: "#86efac",          star: "✦" },
  vezina:    { bg: "rgba(59, 130, 246, 0.10)", border: "rgba(59, 130, 246, 0.45)", fg: "#93c5fd",          star: "▼" },
  iron_man:  { bg: "rgba(156, 163, 175, 0.12)", border: "rgba(156, 163, 175, 0.5)", fg: "#d1d5db",          star: "◆" },
  most_hat_tricks: { bg: "rgba(217, 119, 6, 0.12)",  border: "rgba(217, 119, 6, 0.5)",   fg: "#fbbf24",          star: "♛" },
};

const DEFAULT_STYLE = { bg: "rgba(107, 114, 128, 0.12)", border: "rgba(107, 114, 128, 0.5)", fg: "var(--ink-dim)", star: "★" };

export function AwardBadge({ type, label, seasons }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const style = PALETTE[type] ?? DEFAULT_STYLE;
  const count = seasons.length;

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block group self-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label} badge — earned in ${count} season${count > 1 ? "s" : ""}`}
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[2px] font-mono text-[11px] uppercase tracking-[0.16em] cursor-pointer transition-colors hover:brightness-125 leading-none align-middle"
        style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.fg }}
      >
        <span aria-hidden>{style.star}</span>
        <span>{label}</span>
        {count > 1 && <span className="digit text-[12px]">×{count}</span>}
      </button>

      {/* Hover/click popover with seasons */}
      <div
        className={`absolute left-0 top-full mt-2 z-20 min-w-[180px] panel p-3 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
        }`}
        role="dialog"
      >
        <div className="eyebrow mb-2" style={{ color: style.fg }}>{label}</div>
        <ul className="space-y-1">
          {seasons.map((s, i) => (
            <li key={`${s}-${i}`} className="text-[12.5px] text-ink-dim flex items-center gap-2">
              <span aria-hidden style={{ color: style.fg }}>{style.star}</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
