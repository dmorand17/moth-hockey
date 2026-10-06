"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adjustShootoutTally,
  advancePeriod,
  editEvent,
  finalizeGame,
  recordGoal,
  recordPenalty,
  revertPeriod,
  setClock,
  undoEvent,
  type EditPayload,
} from "@/app/score/[gameId]/actions";
import { PENALTY_TYPES, type PenaltyType } from "@/app/score/[gameId]/penalty-types";
import { formatClock, formatPeriod } from "@/lib/format";

const CLOCK_RE = /^(\d{1,2}):([0-5]?\d)$/;

// Team colors span near-black (#1f2937) to near-white (#e5e7eb), so text laid on
// a solid team color has to pick its own contrast rather than assume a dark board.
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "var(--board)" : "var(--ink)";
}

type Position = "forward" | "defense" | "goalie";

type RosterPlayer = { id: string; name: string; position: Position; isSub: boolean };

type Team = { id: string; name: string; color: string };

type EventRow = {
  id: string;
  type: "goal" | "penalty";
  team_id: string;
  period: number;
  clock_seconds: number;
  scorer_id: string | null;
  scorer_name: string | null;
  assist1_id: string | null;
  assist1_name: string | null;
  assist2_id: string | null;
  assist2_name: string | null;
  penalty_type: string | null;
  penalty_type_other: string | null;
  penalty_shot_result: "goal" | "saved" | null;
  shooter_id: string | null;
  shooter_name: string | null;
};

type Game = {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  period: number;
  clockSeconds: number;
  shootoutHomeGoals: number;
  shootoutAwayGoals: number;
};

type Props = {
  game: Game;
  homeRoster: RosterPlayer[];
  awayRoster: RosterPlayer[];
  events: EventRow[];
};

export function LiveScoring({ game, homeRoster, awayRoster, events }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [sheet, setSheet] = useState<
    | null
    | { kind: "goal"; teamId: string }
    | { kind: "penalty"; teamId: string }
    | { kind: "advance" }
    | { kind: "finalize" }
    | { kind: "clock" }
    | { kind: "eventMenu"; event: EventRow }
    | { kind: "editEvent"; event: EventRow }
  >(null);

  // Local clock that ticks while running. Source of truth for display only;
  // we persist back to the DB every 10s and on pause/event.
  const [running, setRunning] = useState(false);
  const [displayClock, setDisplayClock] = useState(game.clockSeconds);
  const lastPersistedRef = useRef(game.clockSeconds);

  // Used by the visibilitychange handler to read current running state
  // without adding it to that effect's deps.
  const runningRef = useRef(false);
  useEffect(() => { runningRef.current = running; }, [running]);

  // localStorage key scoped to this game for screen-off recovery.
  const clockKey = `sk_clock_${game.id}`;

  // Resync to the server whenever the period changes or the server clock moves.
  // Keying on the period matters: every regulation period seeds the same length,
  // so P1→P2 leaves `clockSeconds` numerically unchanged and a value-only
  // dependency would never fire — the display would keep counting down from the
  // old period and then persist that stale value over the reset.
  const periodRef = useRef(game.period);
  useEffect(() => {
    const periodChanged = periodRef.current !== game.period;
    periodRef.current = game.period;
    // A fresh period starts stopped, at its full length, waiting for puck drop.
    if (periodChanged) setRunning(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayClock(game.clockSeconds);
    lastPersistedRef.current = game.clockSeconds;
  }, [game.period, game.clockSeconds]);

  // Tick once per second when running. Persist every 10 ticks (or when
  // we hit 0). This avoids hammering the DB while still keeping the
  // server roughly in sync for a refresh / spectator view.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setDisplayClock((cur) => {
        const next = Math.max(0, cur - 1);
        if (next === 0) setRunning(false);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Save a wall-clock reference when running starts so we can recover if the
  // screen turns off and the interval is throttled/paused by the browser.
  useEffect(() => {
    if (running) {
      localStorage.setItem(clockKey, JSON.stringify({ at: Date.now(), clock: displayClock }));
    } else {
      localStorage.removeItem(clockKey);
    }
  // displayClock excluded: we only want the value at the moment running changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, clockKey]);

  // When the screen comes back on, snap the clock forward by the real elapsed
  // time rather than trusting the (possibly stalled) interval.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !runningRef.current) return;
      const raw = localStorage.getItem(clockKey);
      if (!raw) return;
      const ref = JSON.parse(raw) as { at: number; clock: number };
      const elapsed = Math.floor((Date.now() - ref.at) / 1000);
      const next = Math.max(0, ref.clock - elapsed);
      setDisplayClock(next);
      if (next === 0) setRunning(false);
      localStorage.setItem(clockKey, JSON.stringify({ at: Date.now(), clock: next }));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [clockKey]);

  // Persist to DB on pause and every 10s while running.
  useEffect(() => {
    const drift = lastPersistedRef.current - displayClock;
    const shouldPersist =
      (!running && drift !== 0) || // user paused; flush
      drift >= 10 ||                // running, 10s elapsed since last persist
      (displayClock === 0 && drift !== 0);
    if (!shouldPersist) return;
    lastPersistedRef.current = displayClock;
    // Fire-and-forget; we don't router.refresh() to avoid disrupting the tick.
    // `period` scopes the write so a tick already in flight when the period
    // changed can't land afterwards and overwrite the new period's reset.
    setClock({ gameId: game.id, clockSeconds: displayClock, period: game.period }).catch(() => {});
  }, [displayClock, running, game.id, game.period]);

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success(res.message ?? "Saved");
        router.refresh();
      }
    });
  };

  const onToggleRun = () => setRunning((r) => !r);

  // Apply a new clock value without disturbing whether it's running — a
  // mid-period correction shouldn't force the scorekeeper to restart the clock.
  const applyClock = (next: number) => {
    const clamped = Math.max(0, Math.min(99 * 60, next));
    setDisplayClock(clamped);
    lastPersistedRef.current = clamped;
    if (clamped === 0) setRunning(false);
    run(() => setClock({ gameId: game.id, clockSeconds: clamped, period: game.period }));
  };

  const onUndoSpecific = (eventId: string) => {
    if (!confirm("Delete this event? Score will be adjusted if needed.")) return;
    run(() => undoEvent({ gameId: game.id, eventId }));
  };

  const onRevertPeriod = () => {
    const stuck = events.filter((e) => e.period === game.period).length;
    const warning = stuck
      ? `\n\n${stuck} event${stuck === 1 ? "" : "s"} recorded in ${formatPeriod(game.period)} will stay there.`
      : "";
    if (!confirm(`Go back to ${formatPeriod(game.period - 1)}? The clock resets.${warning}`)) return;
    run(() => revertPeriod({ gameId: game.id }));
  };

  const isP3End = game.period === 3;
  const inOT = game.period === 4;
  const inSO = game.period === 5;
  const tied = game.homeScore === game.awayScore;
  const soTied = game.shootoutHomeGoals === game.shootoutAwayGoals;

  return (
    <div className="space-y-3 pb-3">
      {/* Sticky scoreboard */}
      <ScoreBar
        game={game}
        displayClock={displayClock}
        running={running}
        onToggleRun={onToggleRun}
        onEditClock={() => setSheet({ kind: "clock" })}
        onStepBackPeriod={game.period > 1 ? onRevertPeriod : undefined}
        onStepForwardPeriod={game.period < 5 ? () => setSheet({ kind: "advance" }) : undefined}
        disabled={pending}
      />

      {error && (
        <div className="panel-bare p-3 text-goal text-[13px]">{error}</div>
      )}

      {/* Per-team primary actions, visually bonded to the team scores above.
          In shootout we swap the goal/penalty buttons for tally adjusters. */}
      <div className="grid grid-cols-2 gap-2 -mt-1">
        {inSO ? (
          <>
            <ShootoutTallyColumn
              team={game.awayTeam}
              tally={game.shootoutAwayGoals}
              onAdjust={(delta) =>
                run(() =>
                  adjustShootoutTally({ gameId: game.id, teamId: game.awayTeam.id, delta }),
                )
              }
              disabled={pending}
            />
            <ShootoutTallyColumn
              team={game.homeTeam}
              tally={game.shootoutHomeGoals}
              onAdjust={(delta) =>
                run(() =>
                  adjustShootoutTally({ gameId: game.id, teamId: game.homeTeam.id, delta }),
                )
              }
              disabled={pending}
            />
          </>
        ) : (
          <>
            <TeamActionColumn
              team={game.awayTeam}
              onGoal={() => setSheet({ kind: "goal", teamId: game.awayTeam.id })}
              onPenalty={() => setSheet({ kind: "penalty", teamId: game.awayTeam.id })}
              disabled={pending}
            />
            <TeamActionColumn
              team={game.homeTeam}
              onGoal={() => setSheet({ kind: "goal", teamId: game.homeTeam.id })}
              onPenalty={() => setSheet({ kind: "penalty", teamId: game.homeTeam.id })}
              disabled={pending}
            />
          </>
        )}
      </div>

      {/* End-of-period / finalize button. Behavior depends on phase:
          - P1, P2: advance to next period
          - P3 + tied: advance to OT
          - P3 + decided: finalize (regulation)
          - OT + decided: finalize (OT)
          - OT + tied: advance to shootout
          - Shootout + tally decided: finalize (shootout)
          - Shootout + tied: disabled, prompts to adjust tallies */}
      {game.period < 3 ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "advance" })}
          disabled={pending}
          className="w-full min-h-[44px] font-display text-[13px] tracking-[0.14em] border bg-board-3 text-amber-400 border-amber-400/40 rounded-[2px] hover:border-amber-400 disabled:opacity-50"
        >
          Start Next Period →
        </button>
      ) : isP3End && tied ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "advance" })}
          disabled={pending}
          className="w-full min-h-[44px] font-display text-[13px] tracking-[0.14em] border bg-board-3 text-amber-400 border-amber-400/40 rounded-[2px] hover:border-amber-400 disabled:opacity-50"
        >
          End regulation → Overtime
        </button>
      ) : isP3End ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "finalize" })}
          disabled={pending}
          className="w-full min-h-[44px] font-display text-[14px] tracking-[0.16em] border bg-board-3 text-ice border-ice/40 rounded-[2px] hover:border-ice"
        >
          FINALIZE GAME
        </button>
      ) : inOT && tied ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "advance" })}
          disabled={pending}
          className="w-full min-h-[44px] font-display text-[13px] tracking-[0.14em] border bg-board-3 text-amber-400 border-amber-400/40 rounded-[2px] hover:border-amber-400 disabled:opacity-50"
        >
          OT tied → Shootout
        </button>
      ) : inOT ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "finalize" })}
          disabled={pending}
          className="w-full min-h-[44px] font-display text-[14px] tracking-[0.16em] border bg-board-3 text-ice border-ice/40 rounded-[2px] hover:border-ice"
        >
          FINALIZE · OT WIN
        </button>
      ) : inSO && !soTied ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "finalize" })}
          disabled={pending}
          className="w-full min-h-[44px] font-display text-[14px] tracking-[0.16em] border bg-board-3 text-ice border-ice/40 rounded-[2px] hover:border-ice"
        >
          FINALIZE · SHOOTOUT WIN
        </button>
      ) : (
        <div className="w-full min-h-[40px] eyebrow text-[11px] text-ink-faint flex items-center justify-center text-center">
          Shootout tied — adjust tallies to finalize
        </div>
      )}

      {/* Events log */}
      <EventsList
        events={events}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        onSelect={(event) => setSheet({ kind: "eventMenu", event })}
        disabled={pending}
      />

      {sheet?.kind === "goal" && (
        <GoalSheet
          game={{ ...game, clockSeconds: displayClock }}
          initialTeamId={sheet.teamId}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          onCancel={() => setSheet(null)}
          onSubmit={(payload) => {
            setSheet(null);
            run(() => recordGoal({ gameId: game.id, ...payload }));
          }}
        />
      )}

      {sheet?.kind === "penalty" && (
        <PenaltySheet
          game={{ ...game, clockSeconds: displayClock }}
          initialTeamId={sheet.teamId}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          onCancel={() => setSheet(null)}
          onSubmit={(payload) => {
            setSheet(null);
            run(() => recordPenalty({ gameId: game.id, ...payload }));
          }}
        />
      )}

      {sheet?.kind === "advance" && (
        <AdvanceSheet
          game={game}
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            run(() => advancePeriod({ gameId: game.id }));
          }}
        />
      )}

      {sheet?.kind === "finalize" && (
        <FinalizeSheet
          game={game}
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            run(() => finalizeGame({ gameId: game.id }));
          }}
        />
      )}

      {sheet?.kind === "clock" && (
        <ClockSheet
          clockSeconds={displayClock}
          running={running}
          onCancel={() => setSheet(null)}
          onApply={(next) => {
            setSheet(null);
            applyClock(next);
          }}
        />
      )}

      {sheet?.kind === "eventMenu" && (
        <Sheet
          title={`${sheet.event.type === "goal" ? "Goal" : "Penalty"} · ${sheet.event.scorer_name ?? ""}`}
          onCancel={() => setSheet(null)}
        >
          <button
            type="button"
            onClick={() => setSheet({ kind: "editEvent", event: sheet.event })}
            className="w-full min-h-[52px] font-display text-[16px] tracking-[0.12em] rounded-[2px] border bg-board-3 text-ice border-ice/40 hover:border-ice"
          >
            EDIT
          </button>
          <button
            type="button"
            onClick={() => {
              const id = sheet.event.id;
              setSheet(null);
              onUndoSpecific(id);
            }}
            className="w-full min-h-[52px] font-display text-[16px] tracking-[0.12em] rounded-[2px] border bg-board-3 text-goal border-goal/40 hover:border-goal"
          >
            DELETE
          </button>
        </Sheet>
      )}

      {sheet?.kind === "editEvent" && (
        <EditEventSheet
          game={game}
          event={sheet.event}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          onCancel={() => setSheet(null)}
          onSubmit={(payload) => {
            const eventId = sheet.event.id;
            setSheet(null);
            run(() => editEvent({ gameId: game.id, eventId, ...payload }));
          }}
        />
      )}
    </div>
  );
}

function ScoreBar({
  game,
  displayClock,
  running,
  onToggleRun,
  onEditClock,
  onStepBackPeriod,
  onStepForwardPeriod,
  disabled,
}: {
  game: Game;
  displayClock: number;
  running: boolean;
  onToggleRun: () => void;
  onEditClock: () => void;
  onStepBackPeriod?: () => void;
  onStepForwardPeriod?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 sm:mx-0">
      <div
        className="scoreboard relative overflow-hidden p-3 space-y-2"
        style={{
          // Outer ring + drop shadow lifts the panel off the page
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,227,240,0.08)",
        }}
      >
        {/* Per-team color washes from each side, fading to the centre */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(120% 80% at 0% 50%, ${game.awayTeam.color}26 0%, transparent 55%),
              radial-gradient(120% 80% at 100% 50%, ${game.homeTeam.color}26 0%, transparent 55%),
              radial-gradient(140% 60% at 50% -20%, rgba(255,255,255,0.06) 0%, transparent 70%)
            `,
          }}
        />
        {/* Top + bottom edge highlights */}
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(124,227,240,0.45), transparent)",
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,56,56,0.35), transparent)",
          }}
        />
        <div className="absolute inset-0 stripes opacity-30 pointer-events-none" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamScore team={game.awayTeam} score={game.awayScore} align="left" />
          <div className="flex flex-col items-center min-w-[120px] gap-1.5">
            <PeriodStepper
              period={game.period}
              running={running}
              onBack={onStepBackPeriod}
              onForward={onStepForwardPeriod}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={onEditClock}
              title="Tap to adjust clock"
              aria-label="Edit clock"
              className={`digit text-[38px] leading-none tabular-nums transition-opacity hover:opacity-80 ${
                running ? "text-ink" : "text-ink-dim"
              }`}
              style={{
                textShadow: running ? "0 0 14px rgba(255, 56, 56, 0.4)" : undefined,
              }}
            >
              {formatClock(displayClock)}
            </button>
          </div>
          <TeamScore team={game.homeTeam} score={game.homeScore} align="right" />
        </div>

        {/* Full-width run control: the most-tapped button on the page, so it
            gets the whole width rather than a 28px chip between the scores. */}
        <button
          type="button"
          onClick={onToggleRun}
          disabled={game.period >= 5}
          className={`relative w-full min-h-[48px] font-display text-[15px] tracking-[0.2em] border rounded-[2px] transition-colors disabled:opacity-40 ${
            running
              ? "bg-goal/20 text-goal border-goal/60 hover:bg-goal/30"
              : "bg-board-3 text-ice border-ice/45 hover:border-ice hover:bg-ice/10"
          }`}
          aria-label={running ? "Pause clock" : "Start clock"}
        >
          {running ? "❚❚  PAUSE" : "▶  START"}
        </button>
      </div>
    </div>
  );
}

function TeamScore({
  team,
  score,
  align,
}: {
  team: Team;
  score: number;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-col min-w-0 ${align === "right" ? "items-end" : "items-start"}`}
    >
      <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span
          aria-hidden
          className="inline-block w-1.5 h-5 rounded-[1px] shrink-0"
          style={{ backgroundColor: team.color, boxShadow: `0 0 10px ${team.color}88` }}
        />
        <span
          className="font-display text-[13px] tracking-[0.1em] truncate max-w-[100px] sm:max-w-[160px] uppercase"
          style={{ color: team.color }}
        >
          {team.name}
        </span>
      </div>
      <span
        className="digit text-[44px] leading-none tabular-nums mt-1"
        style={{
          color: "var(--ink)",
          textShadow: `0 0 12px ${team.color}55`,
        }}
      >
        {score}
      </span>
    </div>
  );
}

function TeamActionColumn({
  team,
  onGoal,
  onPenalty,
  disabled,
}: {
  team: Team;
  onGoal: () => void;
  onPenalty: () => void;
  disabled?: boolean;
}) {
  const onColor = readableOn(team.color);
  return (
    <TeamPanel team={team}>
      <button
        type="button"
        onClick={onGoal}
        disabled={disabled}
        className="w-full min-h-[72px] font-display text-[23px] tracking-[0.14em] rounded-[2px] border active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: team.color,
          color: onColor,
          borderColor: team.color,
          boxShadow: `0 0 18px ${team.color}44`,
        }}
      >
        GOAL
      </button>
      <button
        type="button"
        onClick={onPenalty}
        disabled={disabled}
        className="w-full min-h-[44px] font-display text-[14px] tracking-[0.16em] rounded-[2px] border bg-board/40 active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: team.color, borderColor: `${team.color}66` }}
      >
        PENALTY
      </button>
    </TeamPanel>
  );
}

// Shared chrome for the two per-team action columns: a tinted body and a solid
// team-color header, so each side reads as that team's block at a glance.
function TeamPanel({ team, children }: { team: Team; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[3px] border overflow-hidden"
      style={{
        borderColor: `${team.color}59`,
        background: `linear-gradient(180deg, ${team.color}2e 0%, ${team.color}0f 100%)`,
      }}
    >
      <div
        className="px-2 py-1 font-display text-[12px] tracking-[0.14em] uppercase text-center truncate"
        style={{ background: team.color, color: readableOn(team.color) }}
      >
        {team.name}
      </div>
      <div className="p-1.5 space-y-1.5">{children}</div>
    </div>
  );
}

function ShootoutTallyColumn({
  team,
  tally,
  onAdjust,
  disabled,
}: {
  team: Team;
  tally: number;
  onAdjust: (delta: 1 | -1) => void;
  disabled?: boolean;
}) {
  return (
    <TeamPanel team={team}>
      <div className="flex flex-col items-center gap-1 pt-1">
        <span className="eyebrow text-[10px] text-ink-faint">SO TALLY</span>
        <span
          className="digit text-[44px] leading-none tabular-nums"
          style={{ color: team.color, textShadow: `0 0 12px ${team.color}55` }}
        >
          {tally}
        </span>
        <div className="grid grid-cols-2 gap-1.5 w-full">
          <button
            type="button"
            onClick={() => onAdjust(-1)}
            disabled={disabled || tally === 0}
            className="min-h-[44px] font-display text-[18px] rounded-[2px] border border-rule text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`${team.name} shootout minus one`}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onAdjust(1)}
            disabled={disabled}
            className="min-h-[44px] font-display text-[18px] rounded-[2px] border bg-board-2 text-ink border-ice/40 hover:border-ice disabled:opacity-50"
            aria-label={`${team.name} shootout plus one`}
          >
            +
          </button>
        </div>
      </div>
    </TeamPanel>
  );
}

function EventsList({
  events,
  homeTeam,
  awayTeam,
  onSelect,
  disabled,
}: {
  events: EventRow[];
  homeTeam: Team;
  awayTeam: Team;
  onSelect: (event: EventRow) => void;
  disabled: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="border-t border-rule pt-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-[10px] text-ink-faint">Events</span>
          <span className="eyebrow text-[10px] text-ink-faint">tap to edit</span>
        </div>
        <p className="eyebrow text-[10px] text-ink-faint text-center py-4">
          No events yet
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 border-t border-rule pt-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[10px] text-ink-faint">
          Events · {events.length}
        </span>
        <span className="eyebrow text-[10px] text-ink-faint">tap to edit</span>
      </div>
      <ol className="divide-y divide-rule">
        {events.map((e) => {
          const team = e.team_id === homeTeam.id ? homeTeam : awayTeam;
          const isGoal = e.type === "goal";
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e)}
                disabled={disabled}
                className="w-full py-2 px-2 flex items-start gap-3 text-left border-l-[3px] hover:bg-board-2 transition-colors disabled:opacity-50"
                style={{ borderLeftColor: team.color }}
              >
                <div className="flex flex-col items-start min-w-[52px] shrink-0">
                  <span
                    className={`font-display text-[13px] tracking-[0.16em] leading-none ${
                      isGoal ? "text-goal" : "text-ice"
                    }`}
                  >
                    {isGoal ? "GOAL" : "PEN"}
                  </span>
                  <span className="digit text-[11px] text-ink-faint mt-1 tabular-nums">
                    {formatPeriod(e.period)} · {formatClock(e.clock_seconds)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  {isGoal ? (
                    <>
                      <div className="text-[14px] truncate">{e.scorer_name}</div>
                      {(e.assist1_name || e.assist2_name) && (
                        <div className="text-[12px] text-ink-dim truncate">
                          <span className="eyebrow text-[9px] mr-1">A</span>
                          {[e.assist1_name, e.assist2_name].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-[14px] truncate">
                        {e.scorer_name}{" "}
                        <span className="text-ink-dim">
                          · {e.penalty_type === "other" ? e.penalty_type_other : prettyPenalty(e.penalty_type)}
                        </span>
                      </div>
                      {e.shooter_name && (
                        <div className="text-[12px] text-ink-dim truncate">
                          <span className="eyebrow text-[9px] mr-1">PS</span>
                          {e.shooter_name}{" "}
                          <span
                            className={`font-display tracking-[0.12em] ${
                              e.penalty_shot_result === "goal" ? "text-goal" : "text-ice"
                            }`}
                          >
                            · {e.penalty_shot_result === "goal" ? "GOAL" : "SAVED"}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <span className="eyebrow text-[10px] text-ink-faint shrink-0" aria-hidden>
                  ↶
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function prettyPenalty(t: string | null): string {
  if (!t) return "";
  return t
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Period display doubling as a two-way stepper. Replaces the old single
// "← Back to P1" link below the fold — both directions are now one tap, in the
// place the scorekeeper is already looking.
function PeriodStepper({
  period,
  running,
  onBack,
  onForward,
  disabled,
}: {
  period: number;
  running: boolean;
  onBack?: () => void;
  onForward?: () => void;
  disabled?: boolean;
}) {
  const arrowCls =
    "w-9 min-h-[36px] flex items-center justify-center rounded-[2px] border border-rule bg-board-3/80 text-ink-dim text-[15px] leading-none transition-colors hover:border-ice hover:text-ice disabled:opacity-25 disabled:hover:border-rule disabled:hover:text-ink-dim";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onBack}
        disabled={disabled || !onBack}
        className={arrowCls}
        aria-label="Go back a period"
      >
        ◀
      </button>
      <span
        className={`chip whitespace-nowrap min-w-[58px] justify-center ${running ? "chip-live" : ""}`}
      >
        {running && <span className="live-dot" />}
        {formatPeriod(period)}
      </span>
      <button
        type="button"
        onClick={onForward}
        disabled={disabled || !onForward}
        className={arrowCls}
        aria-label="Advance a period"
      >
        ▶
      </button>
    </div>
  );
}

const CLOCK_NUDGES = [60, 10, 1] as const;

// Clock editor. Replaces window.prompt, which on iOS Safari steals focus, can't
// be styled, and gave no way to make a small correction without retyping.
function ClockSheet({
  clockSeconds,
  running,
  onCancel,
  onApply,
}: {
  clockSeconds: number;
  running: boolean;
  onCancel: () => void;
  onApply: (next: number) => void;
}) {
  const [value, setValue] = useState(clockSeconds);
  const [text, setText] = useState(formatClock(clockSeconds));
  const [localError, setLocalError] = useState<string | null>(null);

  const nudge = (delta: number) => {
    const next = Math.max(0, Math.min(99 * 60, value + delta));
    setValue(next);
    setText(formatClock(next));
    setLocalError(null);
  };

  const commitText = (raw: string) => {
    const m = raw.trim().match(CLOCK_RE);
    if (!m) {
      setLocalError("Use MM:SS, e.g. 14:30");
      return;
    }
    const next = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (next > 99 * 60) {
      setLocalError("Max is 99:00");
      return;
    }
    setValue(next);
    setText(formatClock(next));
    setLocalError(null);
  };

  const nudgeCls =
    "min-h-[48px] font-display text-[15px] tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-ice hover:text-ice disabled:opacity-30";

  return (
    <Sheet title="Adjust clock" onCancel={onCancel}>
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="digit text-[52px] leading-none tabular-nums text-ink">
          {formatClock(value)}
        </span>
        <span className="eyebrow text-[10px] text-ink-faint">
          {running ? "clock keeps running" : "clock stays paused"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {CLOCK_NUDGES.map((n) => (
          <button key={`minus-${n}`} type="button" onClick={() => nudge(-n)} disabled={value === 0} className={nudgeCls}>
            −{n === 60 ? "1:00" : `${n}s`}
          </button>
        ))}
        {CLOCK_NUDGES.map((n) => (
          <button key={`plus-${n}`} type="button" onClick={() => nudge(n)} className={nudgeCls}>
            +{n === 60 ? "1:00" : `${n}s`}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-3 rounded-[2px] border border-rule px-3 min-h-[48px]">
        <span className="eyebrow text-[10px] text-ink-faint shrink-0">Set to</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          inputMode="numeric"
          placeholder="MM:SS"
          aria-label="Set clock to MM:SS"
          className="digit flex-1 bg-transparent text-[18px] tabular-nums text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      {localError && <p className="text-goal text-[13px]">{localError}</p>}

      <button
        type="button"
        onClick={() => {
          const m = text.trim().match(CLOCK_RE);
          const finalValue = m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : value;
          if (finalValue > 99 * 60) {
            setLocalError("Max is 99:00");
            return;
          }
          onApply(finalValue);
        }}
        className="w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] border bg-board-3 text-ice border-ice/40 hover:border-ice"
      >
        APPLY
      </button>
    </Sheet>
  );
}

// =============================================================================
// SHEETS
// =============================================================================

function Sheet({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-board/80 backdrop-blur-sm">
      <div className="bg-board-2 border-t border-rule-strong rounded-t-lg max-h-[92vh] flex flex-col">
        <header className="p-3 flex items-center justify-between border-b border-rule shrink-0">
          <h3 className="font-display text-[18px] tracking-[0.1em]">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="eyebrow text-[10px] text-ink-dim hover:text-ink min-h-[40px] px-3"
          >
            Cancel
          </button>
        </header>
        <div className="overflow-y-auto p-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function GoalSheet({
  game,
  initialTeamId,
  homeRoster,
  awayRoster,
  onCancel,
  onSubmit,
}: {
  game: Game;
  initialTeamId: string;
  homeRoster: RosterPlayer[];
  awayRoster: RosterPlayer[];
  onCancel: () => void;
  onSubmit: (p: {
    teamId: string;
    scorerId: string;
    assist1Id?: string | null;
    assist2Id?: string | null;
    period: number;
    clockSeconds: number;
  }) => void;
}) {
  const teamId = initialTeamId;
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [a1, setA1] = useState<string | null>(null);
  const [a2, setA2] = useState<string | null>(null);

  const teamRoster = teamId === game.homeTeam.id ? homeRoster : awayRoster;
  const teamLabel = teamId === game.homeTeam.id ? game.homeTeam.name : game.awayTeam.name;

  const step: "scorer" | "assists" = !scorerId ? "scorer" : "assists";

  return (
    <Sheet title={`Goal · ${teamLabel}`} onCancel={onCancel}>
      {step === "scorer" && (
        <div className="space-y-2">
          <p className="eyebrow text-[10px]">Scorer</p>
          <PlayerGrid roster={teamRoster} onPick={(id) => setScorerId(id)} />
        </div>
      )}

      {step === "assists" && scorerId && (
        <div className="space-y-3">
          <StepBack
            onBack={() => {
              setScorerId(null);
              setA1(null);
              setA2(null);
            }}
            label="Scorer"
          />
          <Summary
            label="Scorer"
            name={teamRoster.find((p) => p.id === scorerId)?.name ?? "?"}
          />
          {a1 && (
            <Summary
              label="Assist 1"
              name={teamRoster.find((p) => p.id === a1)?.name ?? "?"}
              onClear={() => {
                setA1(null);
                setA2(null);
              }}
            />
          )}
          {a2 && (
            <Summary
              label="Assist 2"
              name={teamRoster.find((p) => p.id === a2)?.name ?? "?"}
              onClear={() => setA2(null)}
            />
          )}

          {/* Show one assist picker at a time so the confirm button stays
              in view. After A1 is chosen the same area swaps to A2. */}
          {!a2 && (
            <>
              <p className="eyebrow text-[10px]">
                {a1 ? "Assist 2 (optional)" : "Assist 1 (optional)"}
              </p>
              <PlayerGrid
                roster={teamRoster.filter(
                  (p) => p.id !== scorerId && p.id !== a1,
                )}
                onPick={(id) => (a1 ? setA2(id) : setA1(id))}
              />
            </>
          )}

          <button
            type="button"
            onClick={() =>
              onSubmit({
                teamId,
                scorerId,
                assist1Id: a1,
                assist2Id: a2,
                period: game.period,
                clockSeconds: game.clockSeconds,
              })
            }
            className="w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] bg-goal text-board border border-goal hover:bg-goal-glow"
          >
            CONFIRM GOAL{a1 ? "" : " · NO ASSISTS"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function PenaltySheet({
  game,
  initialTeamId,
  homeRoster,
  awayRoster,
  onCancel,
  onSubmit,
}: {
  game: Game;
  initialTeamId: string;
  homeRoster: RosterPlayer[];
  awayRoster: RosterPlayer[];
  onCancel: () => void;
  onSubmit: (p: {
    committingTeamId: string;
    offenderId: string;
    penaltyType: PenaltyType;
    penaltyTypeOther?: string | null;
    shotTakerId: string;
    shotResult: "goal" | "saved";
    period: number;
    clockSeconds: number;
  }) => void;
}) {
  const teamId = initialTeamId;
  const [offenderId, setOffenderId] = useState<string | null>(null);
  const [penaltyType, setPenaltyType] = useState<PenaltyType | null>(null);
  const [otherText, setOtherText] = useState("");
  const [shotTakerId, setShotTakerId] = useState<string | null>(null);
  const [shotResult, setShotResult] = useState<"goal" | "saved" | null>(null);

  const committingRoster = teamId === game.homeTeam.id ? homeRoster : awayRoster;
  const opposingRoster = teamId === game.homeTeam.id ? awayRoster : homeRoster;
  const teamLabel = teamId === game.homeTeam.id ? game.homeTeam.name : game.awayTeam.name;
  const opposingLabel = teamId === game.homeTeam.id ? game.awayTeam.name : game.homeTeam.name;

  const step: "offender" | "type" | "shot" =
    !offenderId ? "offender" : !penaltyType ? "type" : "shot";

  const canSubmit =
    !!offenderId &&
    !!penaltyType &&
    (penaltyType !== "other" || otherText.trim().length > 0) &&
    !!shotTakerId &&
    !!shotResult;

  return (
    <Sheet title={`Penalty · ${teamLabel}`} onCancel={onCancel}>
      {step === "offender" && (
        <div className="space-y-2">
          <p className="eyebrow text-[10px]">Offender</p>
          <PlayerGrid roster={committingRoster} onPick={setOffenderId} />
        </div>
      )}

      {step === "type" && offenderId && (
        <div className="space-y-2">
          <StepBack onBack={() => setOffenderId(null)} label="Offender" />
          <Summary
            label="Offender"
            name={committingRoster.find((p) => p.id === offenderId)?.name ?? "?"}
          />
          <p className="eyebrow text-[10px]">Penalty</p>
          <div className="grid grid-cols-2 gap-2">
            {PENALTY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPenaltyType(t)}
                className="min-h-[48px] eyebrow text-[11px] border border-rule rounded-[2px] hover:border-rule-strong hover:text-ink text-ink-dim"
              >
                {prettyPenalty(t)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "shot" && offenderId && penaltyType && (
        <div className="space-y-3">
          <StepBack
            onBack={() => {
              setPenaltyType(null);
              setOtherText("");
              setShotTakerId(null);
              setShotResult(null);
            }}
            label="Penalty"
          />
          <Summary
            label={`${prettyPenalty(penaltyType)} on`}
            name={committingRoster.find((p) => p.id === offenderId)?.name ?? "?"}
          />
          {penaltyType === "other" && (
            <input
              type="text"
              autoFocus
              placeholder="Describe penalty"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              className="w-full min-h-[40px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[14px] text-ink placeholder:text-ink-faint"
            />
          )}
          <p className="eyebrow text-[10px]">{opposingLabel} takes the shot</p>
          <PlayerGrid
            roster={opposingRoster}
            selectedId={shotTakerId}
            onPick={(id) => setShotTakerId(id)}
          />
          <p className="eyebrow text-[10px]">Result</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShotResult("goal")}
              aria-pressed={shotResult === "goal"}
              className={`min-h-[52px] font-display text-[16px] tracking-[0.14em] rounded-[2px] border ${
                shotResult === "goal"
                  ? "bg-goal text-board border-goal"
                  : "border-rule text-ink-dim"
              }`}
            >
              GOAL
            </button>
            <button
              type="button"
              onClick={() => setShotResult("saved")}
              aria-pressed={shotResult === "saved"}
              className={`min-h-[52px] font-display text-[16px] tracking-[0.14em] rounded-[2px] border ${
                shotResult === "saved"
                  ? "bg-ice text-board border-ice"
                  : "border-rule text-ink-dim"
              }`}
            >
              SAVED
            </button>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                committingTeamId: teamId,
                offenderId,
                penaltyType,
                penaltyTypeOther: penaltyType === "other" ? otherText : null,
                shotTakerId: shotTakerId!,
                shotResult: shotResult!,
                period: game.period,
                clockSeconds: game.clockSeconds,
              })
            }
            className={`w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] border ${
              canSubmit
                ? "bg-ice text-board border-ice"
                : "bg-board-3 text-ink-faint border-rule cursor-not-allowed"
            }`}
          >
            CONFIRM PENALTY
          </button>
        </div>
      )}
    </Sheet>
  );
}

function AdvanceSheet({
  game,
  onCancel,
  onConfirm,
}: {
  game: Game;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tied = game.homeScore === game.awayScore;
  const next = game.period + 1;
  const isP3 = game.period === 3;
  const isOT = game.period === 4;
  let heading: string;
  let body: string;
  if (isOT) {
    heading = "OT tied → Shootout";
    body = "OT ended tied. Move to a shootout — track tallies with the per-team +/− buttons.";
  } else if (isP3) {
    heading = "End regulation → Overtime";
    body = "Score is tied. Advance to a 5-minute sudden-death OT period.";
  } else {
    heading = `End ${formatPeriod(game.period)} → ${formatPeriod(next)}`;
    body = `The clock will reset for ${formatPeriod(next)}.`;
  }
  // tied is unused in the non-P3 branches but kept to clarify the contract.
  void tied;
  return (
    <Sheet title={heading} onCancel={onCancel}>
      <p className="text-[14px] text-ink-dim">{body}</p>
      <button
        type="button"
        onClick={onConfirm}
        className="w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] bg-board-3 text-ink border border-rule-strong hover:border-ice"
      >
        Confirm
      </button>
    </Sheet>
  );
}

function FinalizeSheet({
  game,
  onCancel,
  onConfirm,
}: {
  game: Game;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Mirror server logic for the preview — we don't re-finalize here, just
  // describe what's about to happen so the scorekeeper can sanity-check.
  let decided: "regulation" | "ot" | "shootout";
  let homeScore = game.homeScore;
  let awayScore = game.awayScore;
  if (game.period === 5) {
    decided = "shootout";
    if (game.shootoutHomeGoals > game.shootoutAwayGoals) homeScore += 1;
    else if (game.shootoutAwayGoals > game.shootoutHomeGoals) awayScore += 1;
  } else if (game.period === 4) {
    decided = "ot";
  } else {
    decided = "regulation";
  }
  const winner =
    homeScore > awayScore
      ? game.homeTeam
      : awayScore > homeScore
        ? game.awayTeam
        : null;
  const decidedLabel =
    decided === "regulation" ? "FINAL" : decided === "ot" ? "FINAL/OT" : "FINAL/SO";
  return (
    <Sheet title="Finalize game" onCancel={onCancel}>
      <p className="text-[13px] text-ink-dim">
        Locks the score, hides the game from /score, and posts it to standings + stats.
      </p>
      <div className="panel-bare p-3">
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="flex flex-col items-start min-w-0">
            <span
              className="font-display text-[12px] tracking-[0.1em] uppercase truncate"
              style={{ color: game.awayTeam.color }}
            >
              {game.awayTeam.name}
            </span>
            <span className="digit text-[32px] leading-none mt-1">{awayScore}</span>
            {decided === "shootout" && (
              <span className="eyebrow text-[10px] text-ink-faint mt-1">
                SO {game.shootoutAwayGoals}
              </span>
            )}
          </div>
          <div className="flex flex-col items-center">
            <span className="eyebrow text-[10px] text-ink-faint">{decidedLabel}</span>
          </div>
          <div className="flex flex-col items-end min-w-0">
            <span
              className="font-display text-[12px] tracking-[0.1em] uppercase truncate"
              style={{ color: game.homeTeam.color }}
            >
              {game.homeTeam.name}
            </span>
            <span className="digit text-[32px] leading-none mt-1">{homeScore}</span>
            {decided === "shootout" && (
              <span className="eyebrow text-[10px] text-ink-faint mt-1">
                SO {game.shootoutHomeGoals}
              </span>
            )}
          </div>
        </div>
        {winner && (
          <p className="text-center text-[12px] mt-2" style={{ color: winner.color }}>
            {winner.name} win
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] bg-ice text-board border border-ice hover:opacity-90"
      >
        CONFIRM FINALIZE
      </button>
    </Sheet>
  );
}

function FieldRow({
  label,
  value,
  onTap,
}: {
  label: string;
  value: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full min-h-[48px] px-3 py-2 flex items-center gap-3 text-left rounded-[2px] border border-rule hover:border-rule-strong hover:text-ink"
    >
      <span className="eyebrow text-[10px] text-ink-faint w-20 shrink-0">{label}</span>
      <span className="text-[14px] text-ink flex-1 truncate">{value}</span>
      <span className="eyebrow text-[10px] text-ink-faint shrink-0" aria-hidden>▸</span>
    </button>
  );
}

function EditEventSheet({
  game,
  event,
  homeRoster,
  awayRoster,
  onCancel,
  onSubmit,
}: {
  game: Game;
  event: EventRow;
  homeRoster: RosterPlayer[];
  awayRoster: RosterPlayer[];
  onCancel: () => void;
  onSubmit: (payload: EditPayload) => void;
}) {
  const isGoal = event.type === "goal";
  const eventTeamRoster = event.team_id === game.homeTeam.id ? homeRoster : awayRoster;
  const opposingRoster = event.team_id === game.homeTeam.id ? awayRoster : homeRoster;
  const teamLabel = event.team_id === game.homeTeam.id ? game.homeTeam.name : game.awayTeam.name;

  // Shared field state, seeded from the event.
  const [scorerId, setScorerId] = useState<string | null>(event.scorer_id);
  const [a1, setA1] = useState<string | null>(event.assist1_id);
  const [a2, setA2] = useState<string | null>(event.assist2_id);
  const [penaltyType, setPenaltyType] = useState<PenaltyType | null>(
    (event.penalty_type as PenaltyType | null) ?? null,
  );
  const [otherText, setOtherText] = useState(event.penalty_type_other ?? "");
  const [shotTakerId, setShotTakerId] = useState<string | null>(event.shooter_id);
  const [shotResult, setShotResult] = useState<"goal" | "saved" | null>(
    event.penalty_shot_result,
  );
  const [period, setPeriod] = useState<number>(event.period);
  const [clock, setClock] = useState<number>(event.clock_seconds);

  // Which field's picker is open; null = the field list.
  const [field, setField] = useState<
    null | "scorer" | "a1" | "a2" | "offender" | "type" | "shotTaker" | "period" | "time"
  >(null);
  const [clockText, setClockText] = useState(formatClock(event.clock_seconds));
  const [localError, setLocalError] = useState<string | null>(null);

  const nameOf = (roster: RosterPlayer[], id: string | null) =>
    (id && roster.find((p) => p.id === id)?.name) || "—";

  const canSave = isGoal
    ? !!scorerId
    : !!scorerId &&
      !!penaltyType &&
      (penaltyType !== "other" || otherText.trim().length > 0) &&
      !!shotTakerId &&
      !!shotResult;
  // Note: for a penalty the offender is stored/edited via `scorerId`.

  const commit = () => {
    if (isGoal) {
      onSubmit({
        type: "goal",
        scorerId: scorerId!,
        assist1Id: a1,
        assist2Id: a2,
        period,
        clockSeconds: clock,
      });
    } else {
      onSubmit({
        type: "penalty",
        offenderId: scorerId!,
        penaltyType: penaltyType!,
        penaltyTypeOther: penaltyType === "other" ? otherText.trim() : null,
        shotTakerId: shotTakerId!,
        shotResult: shotResult!,
        period,
        clockSeconds: clock,
      });
    }
  };

  const title = `Edit ${isGoal ? "Goal" : "Penalty"} · ${teamLabel}`;

  // Picker sub-views ---------------------------------------------------------
  if (field === "scorer" || field === "offender") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">{isGoal ? "Scorer" : "Offender"}</p>
        <PlayerGrid
          roster={eventTeamRoster}
          selectedId={scorerId}
          onPick={(id) => {
            setScorerId(id);
            setField(null);
          }}
        />
      </Sheet>
    );
  }
  if (field === "a1" || field === "a2") {
    const isA1 = field === "a1";
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">{isA1 ? "Assist 1" : "Assist 2"}</p>
        <PlayerGrid
          roster={eventTeamRoster.filter(
            (p) => p.id !== scorerId && p.id !== (isA1 ? a2 : a1),
          )}
          selectedId={isA1 ? a1 : a2}
          allowDeselect
          onPick={(id) => {
            const cur = isA1 ? a1 : a2;
            const next = cur === id ? null : id;
            if (isA1) setA1(next);
            else setA2(next);
            setField(null);
          }}
        />
      </Sheet>
    );
  }
  if (field === "shotTaker") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Shot taker</p>
        <PlayerGrid
          roster={opposingRoster}
          selectedId={shotTakerId}
          onPick={(id) => {
            setShotTakerId(id);
            setField(null);
          }}
        />
      </Sheet>
    );
  }
  if (field === "type") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Penalty</p>
        <div className="grid grid-cols-2 gap-2">
          {PENALTY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPenaltyType(t);
                setField(null);
              }}
              aria-pressed={penaltyType === t}
              className={`min-h-[48px] eyebrow text-[11px] border rounded-[2px] ${
                penaltyType === t
                  ? "bg-board-3 border-ice text-ink"
                  : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink"
              }`}
            >
              {prettyPenalty(t)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (field === "period") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Period</p>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: game.period }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                setField(null);
              }}
              aria-pressed={period === p}
              className={`min-h-[48px] font-display text-[13px] tracking-[0.12em] border rounded-[2px] ${
                period === p
                  ? "bg-board-3 border-ice text-ink"
                  : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink"
              }`}
            >
              {formatPeriod(p)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (field === "time") {
    return (
      <Sheet title={title} onCancel={onCancel}>
        <StepBack onBack={() => setField(null)} label="Back" />
        <p className="eyebrow text-[10px]">Time (MM:SS)</p>
        <input
          type="text"
          autoFocus
          inputMode="numeric"
          value={clockText}
          onChange={(e) => setClockText(e.target.value)}
          className="w-full min-h-[44px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[16px] text-ink tabular-nums"
        />
        {localError && <p className="text-goal text-[12px]">{localError}</p>}
        <button
          type="button"
          onClick={() => {
            const m = clockText.match(CLOCK_RE);
            if (!m) {
              setLocalError("Use MM:SS format, e.g. 14:30");
              return;
            }
            const secs = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
            if (secs > 99 * 60) {
              setLocalError("Clock must be between 0:00 and 99:00");
              return;
            }
            setLocalError(null);
            setClock(secs);
            setField(null);
          }}
          className="w-full min-h-[48px] font-display text-[14px] tracking-[0.12em] rounded-[2px] bg-board-3 text-ink border border-rule-strong hover:border-ice"
        >
          Set time
        </button>
      </Sheet>
    );
  }

  // Field list ---------------------------------------------------------------
  return (
    <Sheet title={title} onCancel={onCancel}>
      <div className="space-y-1.5">
        {isGoal ? (
          <>
            <FieldRow label="Scorer" value={nameOf(eventTeamRoster, scorerId)} onTap={() => setField("scorer")} />
            <FieldRow label="Assist 1" value={nameOf(eventTeamRoster, a1)} onTap={() => setField("a1")} />
            <FieldRow label="Assist 2" value={nameOf(eventTeamRoster, a2)} onTap={() => setField("a2")} />
          </>
        ) : (
          <>
            <FieldRow label="Offender" value={nameOf(eventTeamRoster, scorerId)} onTap={() => setField("offender")} />
            <FieldRow
              label="Penalty"
              value={penaltyType ? (penaltyType === "other" ? otherText || "Other" : prettyPenalty(penaltyType)) : "—"}
              onTap={() => setField("type")}
            />
            {penaltyType === "other" && (
              <input
                type="text"
                placeholder="Describe penalty"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                className="w-full min-h-[44px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[14px] text-ink placeholder:text-ink-faint"
              />
            )}
            <FieldRow label="Shot taker" value={nameOf(opposingRoster, shotTakerId)} onTap={() => setField("shotTaker")} />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShotResult("goal")}
                aria-pressed={shotResult === "goal"}
                className={`min-h-[48px] font-display text-[14px] tracking-[0.14em] rounded-[2px] border ${
                  shotResult === "goal" ? "bg-goal text-board border-goal" : "border-rule text-ink-dim"
                }`}
              >
                GOAL
              </button>
              <button
                type="button"
                onClick={() => setShotResult("saved")}
                aria-pressed={shotResult === "saved"}
                className={`min-h-[48px] font-display text-[14px] tracking-[0.14em] rounded-[2px] border ${
                  shotResult === "saved" ? "bg-ice text-board border-ice" : "border-rule text-ink-dim"
                }`}
              >
                SAVED
              </button>
            </div>
          </>
        )}
        <FieldRow label="Period" value={formatPeriod(period)} onTap={() => setField("period")} />
        <FieldRow label="Time" value={formatClock(clock)} onTap={() => { setClockText(formatClock(clock)); setLocalError(null); setField("time"); }} />
      </div>
      <button
        type="button"
        disabled={!canSave}
        onClick={commit}
        className={`w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] border ${
          canSave ? "bg-ice text-board border-ice" : "bg-board-3 text-ink-faint border-rule cursor-not-allowed"
        }`}
      >
        SAVE CHANGES
      </button>
    </Sheet>
  );
}

function PlayerGrid({
  roster,
  selectedId,
  onPick,
  allowDeselect,
  disabled,
}: {
  roster: RosterPlayer[];
  selectedId?: string | null;
  onPick: (id: string) => void;
  allowDeselect?: boolean;
  disabled?: boolean;
}) {
  const sorted = useMemo(() => {
    const order: Record<Position, number> = { forward: 0, defense: 1, goalie: 2 };
    return [...roster].sort((a, b) => {
      const oa = order[a.position] ?? 9;
      const ob = order[b.position] ?? 9;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
  }, [roster]);

  if (disabled) {
    return (
      <p className="eyebrow text-[10px] text-ink-faint italic">
        Pick A1 first to enable A2.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {sorted.map((p) => {
        const isSelected = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            aria-pressed={isSelected}
            className={`min-h-[48px] px-3 py-2 text-left rounded-[2px] border flex items-center gap-2 ${
              isSelected
                ? "bg-board-3 border-ice text-ink"
                : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink"
            }`}
          >
            <span className="text-[14px] flex-1 truncate">{p.name}</span>
            <span
              className={`eyebrow text-[9px] ${
                p.position === "goalie" ? "text-ice" : "text-ink-faint"
              }`}
            >
              {p.position === "forward" ? "FWD" : p.position === "defense" ? "DEF" : "G"}
            </span>
            {p.isSub && <span className="eyebrow text-[9px] text-goal">SUB</span>}
          </button>
        );
      })}
      {allowDeselect && selectedId && (
        <button
          type="button"
          onClick={() => onPick(selectedId)}
          className="col-span-2 min-h-[40px] eyebrow text-[10px] text-ink-faint hover:text-ink"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}

function StepBack({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="eyebrow text-[10px] text-ink-dim hover:text-ink min-h-[36px]"
    >
      ← {label}
    </button>
  );
}

function Summary({
  label,
  name,
  onClear,
}: {
  label: string;
  name: string;
  onClear?: () => void;
}) {
  return (
    <div className="panel-bare p-2 px-3 text-[13px] flex items-center gap-2">
      <span className="eyebrow text-[10px] shrink-0">{label}</span>
      <span className="text-ink flex-1 truncate">{name}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className="eyebrow text-[10px] text-ink-faint hover:text-ink min-h-[28px] px-1 shrink-0"
        >
          ✕
        </button>
      )}
    </div>
  );
}
