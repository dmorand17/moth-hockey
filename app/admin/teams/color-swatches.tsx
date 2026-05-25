"use client";

import { useState } from "react";

const TEAM_COLORS: { value: string; label: string }[] = [
  { value: "#ef4444", label: "Red" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#22c55e", label: "Green" },
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
];

export function ColorSwatches({
  name,
  defaultValue,
  idPrefix,
}: {
  name: string;
  defaultValue: string;
  idPrefix: string;
}) {
  const presetMatch = TEAM_COLORS.find(
    (c) => c.value.toLowerCase() === defaultValue.toLowerCase(),
  );
  const [selected, setSelected] = useState<string>(defaultValue);
  const [customValue, setCustomValue] = useState<string>(presetMatch ? "#7c3aed" : defaultValue);
  const customSelected = !TEAM_COLORS.some(
    (c) => c.value.toLowerCase() === selected.toLowerCase(),
  );

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {TEAM_COLORS.map((c) => {
        const id = `${idPrefix}-${c.value.replace("#", "")}`;
        const isSelected = c.value.toLowerCase() === selected.toLowerCase();
        const isWhite = c.value.toLowerCase() === "#ffffff";
        const selectedRing = isWhite ? "border-board ring-2 ring-ink" : "border-ink";
        return (
          <label
            key={c.value}
            htmlFor={id}
            title={c.label}
            className={`relative h-11 w-11 rounded cursor-pointer border-2 transition-all ${
              isSelected ? `${selectedRing} scale-105` : "border-rule hover:border-ink-dim"
            }`}
            style={{ background: c.value }}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={c.value}
              checked={isSelected}
              onChange={() => setSelected(c.value)}
              className="sr-only"
            />
            <span className="sr-only">{c.label}</span>
          </label>
        );
      })}

      <label
        htmlFor={`${idPrefix}-custom`}
        title="Custom color"
        className={`relative h-11 w-11 rounded cursor-pointer border-2 transition-all overflow-hidden ${
          customSelected ? "border-ink scale-105" : "border-rule hover:border-ink-dim"
        }`}
        style={
          customSelected
            ? { background: customValue }
            : {
                background:
                  "conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)",
              }
        }
      >
        <input
          id={`${idPrefix}-custom`}
          type="color"
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            setSelected(e.target.value);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span className="sr-only">Custom color</span>
      </label>

      {customSelected && (
        <input type="hidden" name={name} value={selected} />
      )}
    </div>
  );
}
