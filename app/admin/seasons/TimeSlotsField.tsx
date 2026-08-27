"use client";

import { useState } from "react";

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice";

/**
 * Configurable list of game-night time slots for schedule generation.
 * Renders one `<input type="time" name="times">` per slot (empties are
 * filtered server-side) and a reactive hint tying the slot count to the
 * games-per-night implied by the team count (with bye handling for odd
 * counts). Seeded with `defaultTimes`.
 */
export function TimeSlotsField({
  teamCount,
  defaultTimes,
}: {
  teamCount: number;
  defaultTimes: string[];
}) {
  const [slots, setSlots] = useState<string[]>(
    defaultTimes.length > 0 ? defaultTimes : [""],
  );

  const gamesPerNight = teamCount >= 2 ? Math.floor(teamCount / 2) : 0;
  const hasBye = teamCount % 2 === 1;
  const filledCount = slots.filter((s) => s.trim() !== "").length;
  const mismatch = gamesPerNight > 0 && filledCount !== gamesPerNight;
  const plural = (n: number) => (n === 1 ? "" : "s");

  const update = (i: number, v: string) =>
    setSlots((s) => s.map((x, j) => (j === i ? v : x)));
  const add = () => setSlots((s) => [...s, ""]);
  const remove = (i: number) =>
    setSlots((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));

  return (
    <fieldset className="space-y-2">
      <legend className="eyebrow">Time slots (per game-night)</legend>

      <div className="space-y-2">
        {slots.map((val, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              name="times"
              value={val}
              onChange={(e) => update(i, e.target.value)}
              className={`${inputCls} w-[150px]`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={slots.length <= 1}
              aria-label={`Remove time slot ${i + 1}`}
              className="min-h-11 min-w-11 text-ink-faint hover:text-goal transition-colors disabled:opacity-30 disabled:hover:text-ink-faint disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="min-h-11 px-3 border border-rule rounded text-ink-dim hover:text-ink hover:border-rule-strong font-mono text-[12px] tracking-[0.06em] transition-colors"
      >
        + Add time slot
      </button>

      {gamesPerNight > 0 && (
        <p className={`text-[12px] leading-relaxed ${mismatch ? "text-goal/90" : "text-ink-faint"}`}>
          With {teamCount} teams,{" "}
          {hasBye ? "one team byes each week and " : ""}
          <strong>
            {gamesPerNight} game{plural(gamesPerNight)}
          </strong>{" "}
          {gamesPerNight === 1 ? "is" : "are"} played per night.{" "}
          {mismatch
            ? `Add exactly ${gamesPerNight} time slot${plural(gamesPerNight)} (you have ${filledCount}) so each week's games land on a single night.`
            : `✓ ${filledCount} slot${plural(filledCount)} — each week's games land on one night.`}
        </p>
      )}
    </fieldset>
  );
}
