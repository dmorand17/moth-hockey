"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  advancePeriod,
  recordGoal,
  recordPenalty,
  setClock,
  undoEvent,
} from "@/app/score/[gameId]/actions";
import { PENALTY_TYPES, type PenaltyType } from "@/app/score/[gameId]/penalty-types";
import { formatClock, formatPeriod } from "@/lib/format";

type Position = "forward" | "defense" | "goalie";

type RosterPlayer = { id: string; name: string; position: Position; isSub: boolean };

type Team = { id: string; name: string; color: string };

type EventRow = {
  id: string;
  type: "goal" | "penalty";
  team_id: string;
  period: number;
  clock_seconds: number;
  scorer_name: string | null;
  assist1_name: string | null;
  assist2_name: string | null;
  penalty_type: string | null;
  penalty_type_other: string | null;
  penalty_shot_result: "goal" | "saved" | null;
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
  >(null);

  // Local clock that ticks while running. Source of truth for display only;
  // we persist back to the DB every 10s and on pause/event.
  const [running, setRunning] = useState(false);
  const [displayClock, setDisplayClock] = useState(game.clockSeconds);
  const lastPersistedRef = useRef(game.clockSeconds);

  // When the server clock changes (refresh after an action), resync.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayClock(game.clockSeconds);
    lastPersistedRef.current = game.clockSeconds;
  }, [game.clockSeconds]);

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
    setClock({ gameId: game.id, clockSeconds: displayClock }).catch(() => {});
  }, [displayClock, running, game.id]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const onToggleRun = () => setRunning((r) => !r);

  const onEditClock = () => {
    setRunning(false);
    const cur = formatClock(displayClock);
    const input = window.prompt("Set clock (MM:SS)", cur);
    if (input == null) return;
    const m = input.match(/^(\d{1,2}):([0-5]?\d)$/);
    if (!m) {
      setError("Use MM:SS format, e.g. 14:30");
      return;
    }
    const next = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (next < 0 || next > 99 * 60) {
      setError("Clock must be between 0:00 and 99:00");
      return;
    }
    setDisplayClock(next);
    run(() => setClock({ gameId: game.id, clockSeconds: next }));
  };

  const onUndoSpecific = (eventId: string) => {
    if (!confirm("Undo this event? Score will be adjusted if needed.")) return;
    run(() => undoEvent({ gameId: game.id, eventId }));
  };

  const isP3End = game.period === 3;

  return (
    <div className="space-y-3 pb-3">
      {/* Sticky scoreboard */}
      <ScoreBar
        game={game}
        displayClock={displayClock}
        running={running}
        onToggleRun={onToggleRun}
        onEditClock={onEditClock}
      />

      {error && (
        <div className="panel-bare p-3 text-goal text-[13px]">{error}</div>
      )}

      {/* Per-team primary actions, visually bonded to the team scores above */}
      <div className="grid grid-cols-2 gap-2 -mt-1">
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
      </div>

      {/* End-period button. Spans full width since undo is now handled by tapping events. */}
      {isP3End ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "advance" })}
          disabled={pending}
          className="w-full min-h-[40px] eyebrow text-[11px] border border-rule-strong rounded-[2px] hover:text-ink hover:border-ice text-ink-dim"
        >
          End regulation →
        </button>
      ) : game.period < 3 ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "advance" })}
          disabled={pending}
          className="w-full min-h-[40px] eyebrow text-[11px] border border-rule rounded-[2px] hover:text-ink hover:border-rule-strong text-ink-dim"
        >
          End {formatPeriod(game.period)} →
        </button>
      ) : game.period === 4 ? (
        <div className="w-full min-h-[40px] eyebrow text-[11px] text-ink-faint flex items-center justify-center text-center">
          OT — Wave 4 soon
        </div>
      ) : (
        <div className="w-full min-h-[40px] eyebrow text-[11px] text-ink-faint flex items-center justify-center text-center">
          Shootout — Wave 4 soon
        </div>
      )}

      {/* Events log */}
      <EventsList
        events={events}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        onUndo={onUndoSpecific}
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
    </div>
  );
}

function ScoreBar({
  game,
  displayClock,
  running,
  onToggleRun,
  onEditClock,
}: {
  game: Game;
  displayClock: number;
  running: boolean;
  onToggleRun: () => void;
  onEditClock: () => void;
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
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamScore team={game.awayTeam} score={game.awayScore} align="left" />
          <div className="flex flex-col items-center min-w-[96px] gap-1">
            <span className="chip chip-live whitespace-nowrap">
              <span className="live-dot" /> {formatPeriod(game.period)}
            </span>
            <button
              type="button"
              onClick={onEditClock}
              title="Tap to edit clock"
              aria-label="Edit clock"
              className={`digit text-[34px] leading-none tabular-nums hover:opacity-80 transition-opacity ${
                running ? "text-ink" : "text-ink-dim"
              }`}
              style={{
                textShadow: running ? "0 0 12px rgba(255, 56, 56, 0.35)" : undefined,
              }}
            >
              {formatClock(displayClock)}
            </button>
            <button
              type="button"
              onClick={onToggleRun}
              className={`h-7 px-2.5 eyebrow text-[10px] tracking-[0.18em] border rounded-[2px] transition-colors ${
                running
                  ? "bg-goal/15 text-goal border-goal/50 hover:bg-goal/25"
                  : "bg-board-3 text-ink-dim border-rule hover:border-ice hover:text-ice"
              }`}
              aria-label={running ? "Pause clock" : "Start clock"}
            >
              {running ? "❚❚ PAUSE" : "▶ START"}
            </button>
          </div>
          <TeamScore team={game.homeTeam} score={game.homeScore} align="right" />
        </div>
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
  return (
    <div className="space-y-1.5">
      {/* Team rail header: ties this column to the score panel above */}
      <div
        aria-hidden
        className="h-1 rounded-[1px]"
        style={{ background: team.color, boxShadow: `0 0 12px ${team.color}55` }}
      />
      <button
        type="button"
        onClick={onGoal}
        disabled={disabled}
        className="w-full min-h-[68px] font-display text-[22px] tracking-[0.14em] rounded-[2px] border bg-goal text-board border-goal hover:bg-goal-glow active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      >
        GOAL
      </button>
      <button
        type="button"
        onClick={onPenalty}
        disabled={disabled}
        className="w-full min-h-[44px] font-display text-[14px] tracking-[0.16em] rounded-[2px] border bg-board-3 text-ice border-ice/40 hover:border-ice active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      >
        PENALTY
      </button>
    </div>
  );
}

function EventsList({
  events,
  homeTeam,
  awayTeam,
  onUndo,
  disabled,
}: {
  events: EventRow[];
  homeTeam: Team;
  awayTeam: Team;
  onUndo: (id: string) => void;
  disabled: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="border-t border-rule pt-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-[10px] text-ink-faint">Events</span>
          <span className="eyebrow text-[10px] text-ink-faint">tap to undo</span>
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
        <span className="eyebrow text-[10px] text-ink-faint">tap to undo</span>
      </div>
      <ol className="divide-y divide-rule">
        {events.map((e) => {
          const team = e.team_id === homeTeam.id ? homeTeam : awayTeam;
          const isGoal = e.type === "goal";
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onUndo(e.id)}
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
          <p className="eyebrow text-[10px]">Assist 1 (optional)</p>
          <PlayerGrid
            roster={teamRoster.filter((p) => p.id !== scorerId)}
            selectedId={a1}
            onPick={(id) => setA1(a1 === id ? null : id)}
            allowDeselect
          />
          <p className="eyebrow text-[10px]">Assist 2 (optional)</p>
          <PlayerGrid
            roster={teamRoster.filter((p) => p.id !== scorerId && p.id !== a1)}
            selectedId={a2}
            onPick={(id) => setA2(a2 === id ? null : id)}
            allowDeselect
            disabled={!a1}
          />
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
            CONFIRM GOAL
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
  const heading = isP3
    ? tied
      ? "End regulation → Overtime"
      : "End regulation"
    : `End ${formatPeriod(game.period)} → ${formatPeriod(next)}`;
  const body = isP3
    ? tied
      ? "Score is tied. Advance to a 5-minute sudden-death OT period."
      : "A team has the lead. Wave 5 (finalize) ships next; for now this just advances the period."
    : `The clock will reset for ${formatPeriod(next)}.`;
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

function Summary({ label, name }: { label: string; name: string }) {
  return (
    <div className="panel-bare p-2 px-3 text-[13px]">
      <span className="eyebrow text-[10px] mr-2">{label}</span>
      <span className="text-ink">{name}</span>
    </div>
  );
}
