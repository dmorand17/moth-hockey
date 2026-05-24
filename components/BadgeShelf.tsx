"use client";

import { useState } from "react";

type Award = {
  type: string;
  label: string;
  seasons: string[];
};

type Style = {
  bg: string;
  border: string;
  fg: string;
  star: string;
  glow?: string;
};

const PALETTE: Record<string, Style> = {
  champion: {
    bg: "linear-gradient(180deg, rgba(255, 56, 56, 0.28) 0%, rgba(255, 56, 56, 0.16) 100%)",
    border: "rgba(255, 80, 80, 0.85)",
    fg: "#ffd9d9",
    star: "★",
    glow: "0 0 14px rgba(255, 56, 56, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
  },
  mvp: {
    bg: "linear-gradient(180deg, rgba(245, 158, 11, 0.30) 0%, rgba(245, 158, 11, 0.15) 100%)",
    border: "rgba(251, 191, 36, 0.85)",
    fg: "#fde7b4",
    star: "★",
    glow: "0 0 14px rgba(245, 158, 11, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
  },
  mvd: { bg: "rgba(124, 227, 240, 0.10)", border: "rgba(124, 227, 240, 0.45)", fg: "var(--ice)", star: "★" },
  vezina: { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(96, 165, 250, 0.55)", fg: "#93c5fd", star: "▼" },
  sniper: { bg: "rgba(232, 121, 249, 0.12)", border: "rgba(232, 121, 249, 0.55)", fg: "#f0abfc", star: "◎" },
  most_hat_tricks: { bg: "rgba(45, 212, 191, 0.12)", border: "rgba(45, 212, 191, 0.55)", fg: "#5eead4", star: "♛" },
  playmaker: { bg: "rgba(34, 197, 94, 0.10)", border: "rgba(74, 222, 128, 0.50)", fg: "#86efac", star: "✦" },
  iron_man: { bg: "rgba(156, 163, 175, 0.10)", border: "rgba(156, 163, 175, 0.45)", fg: "#d1d5db", star: "◆" },
  goon: { bg: "rgba(168, 85, 247, 0.10)", border: "rgba(192, 132, 252, 0.50)", fg: "#c084fc", star: "✪" },
};

const DEFAULT_STYLE: Style = {
  bg: "rgba(107, 114, 128, 0.12)",
  border: "rgba(107, 114, 128, 0.5)",
  fg: "var(--ink-dim)",
  star: "★",
};

const HEADLINE = new Set(["champion", "mvp"]);

export function BadgeShelf({ awards }: { awards: Award[] }) {
  const [selectedType, setSelectedType] = useState<string | null>(awards[0]?.type ?? null);
  if (awards.length === 0) return null;

  const selected = awards.find((a) => a.type === selectedType) ?? awards[0];
  const selStyle = PALETTE[selected.type] ?? DEFAULT_STYLE;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
      {/* Details panel — shown on the left on desktop, below on mobile */}
      <div
        className="panel-bare p-3 min-h-[92px] order-2 md:order-1 flex flex-col justify-center"
        style={{ borderColor: selStyle.border }}
      >
        <div
          className="font-mono text-[10px] tracking-[0.18em] uppercase flex items-center gap-1.5"
          style={{ color: selStyle.fg }}
        >
          <span aria-hidden>{selStyle.star}</span>
          <span>{selected.label}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint">
            {selected.seasons.length} season{selected.seasons.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {selected.seasons.map((s, i) => (
            <li key={`${s}-${i}`} className="text-[12px] text-ink-dim">
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* Badge stack */}
      <div className="flex flex-row md:flex-col flex-wrap gap-1.5 order-1 md:order-2">
        {awards.map(({ type, label, seasons }) => {
          const style = PALETTE[type] ?? DEFAULT_STYLE;
          const active = type === selected.type;
          const headline = HEADLINE.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              aria-pressed={active}
              aria-label={`${label}${seasons.length > 1 ? `, ${seasons.length} seasons` : ""}`}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono text-[10.5px] uppercase tracking-[0.16em] cursor-pointer transition-all leading-none whitespace-nowrap ${
                active ? "brightness-125" : "opacity-80 hover:opacity-100"
              }`}
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                color: style.fg,
                boxShadow: headline
                  ? style.glow ?? "none"
                  : active
                    ? "inset 0 0 0 1px rgba(255, 255, 255, 0.08)"
                    : "none",
                fontWeight: headline ? 600 : 500,
              }}
            >
              <span aria-hidden>{style.star}</span>
              <span>{label}</span>
              {seasons.length > 1 && <span className="digit text-[11px]">×{seasons.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
