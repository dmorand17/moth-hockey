"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  advancePeriod,
  PENALTY_TYPES,
  PenaltyType,
  recordGoal,
  recordPenalty,
  setClock,
  undoEvent,
} from "@/app/score/[gameId]/actions";
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

  const [sheet, setSheet] = useState<null | "goal" | "penalty" | "advance">(null);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const onSetClock = (delta: number) => {
    const next = Math.max(0, game.clockSeconds + delta);
    run(() => setClock({ gameId: game.id, clockSeconds: next }));
  };

  const onUndoMostRecent = () => {
    if (events.length === 0) return;
    const ev = events[0]; // newest first
    if (!confirm("Undo the most recent event?")) return;
    run(() => undoEvent({ gameId: game.id, eventId: ev.id }));
  };

  const onUndoSpecific = (eventId: string) => {
    if (!confirm("Undo this event? Score will be adjusted if needed.")) return;
    run(() => undoEvent({ gameId: game.id, eventId }));
  };

  const isP3End = game.period === 3;

  return (
    <div className="space-y-4 pb-32">
      {/* Sticky scoreboard */}
      <ScoreBar game={game} onSetClock={onSetClock} pending={pending} />

      {error && (
        <div className="panel-bare p-3 text-goal text-[13px]">{error}</div>
      )}

      {/* Primary actions */}
      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          label="Goal"
          tone="goal"
          onClick={() => setSheet("goal")}
          disabled={pending}
        />
        <ActionButton
          label="Penalty"
          tone="ice"
          onClick={() => setSheet("penalty")}
          disabled={pending}
        />
        <ActionButton
          label="Undo"
          tone="muted"
          onClick={onUndoMostRecent}
          disabled={pending || events.length === 0}
        />
      </div>

      {/* End-of-period button */}
      <div className="flex flex-wrap gap-2">
        {isP3End && (
          <button
            type="button"
            onClick={() => setSheet("advance")}
            disabled={pending}
            className="flex-1 min-h-[44px] eyebrow text-[11px] border border-rule-strong rounded-[2px] hover:text-ink hover:border-ice text-ink-dim"
          >
            End regulation →
          </button>
        )}
        {game.period < 3 && (
          <button
            type="button"
            onClick={() => setSheet("advance")}
            disabled={pending}
            className="flex-1 min-h-[44px] eyebrow text-[11px] border border-rule rounded-[2px] hover:text-ink hover:border-rule-strong text-ink-dim"
          >
            End {formatPeriod(game.period)} →
          </button>
        )}
        {game.period === 4 && (
          <span className="flex-1 min-h-[44px] eyebrow text-[11px] text-ink-faint flex items-center justify-center">
            OT — Wave 4 finalize coming soon
          </span>
        )}
        {game.period >= 5 && (
          <span className="flex-1 min-h-[44px] eyebrow text-[11px] text-ink-faint flex items-center justify-center">
            Shootout — Wave 4 finalize coming soon
          </span>
        )}
      </div>

      {/* Events log */}
      <EventsList
        events={events}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        onUndo={onUndoSpecific}
        disabled={pending}
      />

      {sheet === "goal" && (
        <GoalSheet
          game={game}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          onCancel={() => setSheet(null)}
          onSubmit={(payload) => {
            setSheet(null);
            run(() => recordGoal({ gameId: game.id, ...payload }));
          }}
        />
      )}

      {sheet === "penalty" && (
        <PenaltySheet
          game={game}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          onCancel={() => setSheet(null)}
          onSubmit={(payload) => {
            setSheet(null);
            run(() => recordPenalty({ gameId: game.id, ...payload }));
          }}
        />
      )}

      {sheet === "advance" && (
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
  onSetClock,
  pending,
}: {
  game: Game;
  onSetClock: (delta: number) => void;
  pending: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 sm:mx-0 bg-board/95 backdrop-blur border-b border-rule">
      <div className="px-3 py-3 sm:px-0 space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamScore team={game.awayTeam} score={game.awayScore} align="left" />
          <div className="flex flex-col items-center min-w-[88px]">
            <span className="chip chip-live whitespace-nowrap">
              <span className="live-dot" /> {formatPeriod(game.period)}
            </span>
            <span className="digit text-[26px] sm:text-[28px] mt-1 leading-none">
              {formatClock(game.clockSeconds)}
            </span>
          </div>
          <TeamScore team={game.homeTeam} score={game.homeScore} align="right" />
        </div>
        <div className="flex justify-center gap-1">
          <ClockBtn label="−1m" disabled={pending} onClick={() => onSetClock(-60)} />
          <ClockBtn label="−10s" disabled={pending} onClick={() => onSetClock(-10)} />
          <ClockBtn label="+10s" disabled={pending} onClick={() => onSetClock(+10)} />
          <ClockBtn label="+1m" disabled={pending} onClick={() => onSetClock(+60)} />
        </div>
      </div>
    </div>
  );
}

function ClockBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[36px] px-2 eyebrow text-[10px] border border-rule rounded-[2px] hover:border-rule-strong hover:text-ink text-ink-dim disabled:opacity-50"
    >
      {label}
    </button>
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
      className={`flex items-center gap-2 min-w-0 ${
        align === "right" ? "justify-end flex-row-reverse" : ""
      }`}
    >
      <span
        aria-hidden
        className="inline-block w-1 h-7 rounded-[1px] shrink-0"
        style={{ backgroundColor: team.color, boxShadow: `0 0 8px ${team.color}55` }}
      />
      <div className={`flex items-baseline gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="font-display text-[16px] sm:text-[18px] tracking-[0.06em] truncate max-w-[110px] sm:max-w-[160px]">
          {team.name}
        </span>
        <span className="digit text-[26px] leading-none">{score}</span>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  tone: "goal" | "ice" | "muted";
  onClick: () => void;
  disabled?: boolean;
}) {
  const cls =
    tone === "goal"
      ? "bg-goal text-board border-goal hover:bg-goal-glow"
      : tone === "ice"
        ? "bg-ice text-board border-ice hover:opacity-90"
        : "bg-board-3 text-ink border-rule-strong hover:border-ice";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[64px] font-display text-[20px] tracking-[0.14em] rounded-[2px] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {label.toUpperCase()}
    </button>
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
      <p className="eyebrow text-ink-faint text-center py-4">
        No events yet — record a goal or penalty.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="eyebrow text-[10px] text-ink-dim px-1">Events · newest first · tap to undo</div>
      <ol className="space-y-1.5">
        {events.map((e) => {
          const team = e.team_id === homeTeam.id ? homeTeam : awayTeam;
          const isGoal = e.type === "goal";
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onUndo(e.id)}
                disabled={disabled}
                className="w-full panel-bare p-3 flex items-start gap-3 text-left border-l-[3px] disabled:opacity-50"
                style={{ borderLeftColor: team.color }}
              >
                <div className="flex flex-col items-center min-w-[40px] shrink-0">
                  <span
                    className={`font-display text-[13px] tracking-[0.14em] ${
                      isGoal ? "text-goal" : "text-ice"
                    }`}
                  >
                    {isGoal ? "GOAL" : "PEN"}
                  </span>
                  <span className="digit text-[12px] text-ink-dim mt-0.5">
                    {formatPeriod(e.period)} {formatClock(e.clock_seconds)}
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
  homeRoster,
  awayRoster,
  onCancel,
  onSubmit,
}: {
  game: Game;
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
  const [teamId, setTeamId] = useState<string | null>(null);
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [a1, setA1] = useState<string | null>(null);
  const [a2, setA2] = useState<string | null>(null);

  const teamRoster =
    teamId === game.homeTeam.id
      ? homeRoster
      : teamId === game.awayTeam.id
        ? awayRoster
        : [];
  // Skaters only for assists (not the goalie, generally — but allow it).
  const teamLabel =
    teamId === game.homeTeam.id
      ? game.homeTeam.name
      : teamId === game.awayTeam.id
        ? game.awayTeam.name
        : null;

  // Step state: pick team → pick scorer → pick assists → confirm.
  const step: "team" | "scorer" | "assists" = !teamId ? "team" : !scorerId ? "scorer" : "assists";

  return (
    <Sheet title="Record Goal" onCancel={onCancel}>
      {step === "team" && (
        <TeamPicker game={game} onPick={setTeamId} />
      )}

      {step === "scorer" && teamId && (
        <div className="space-y-2">
          <StepBack onBack={() => setTeamId(null)} label={teamLabel ?? ""} />
          <p className="eyebrow text-[10px]">Scorer</p>
          <PlayerGrid
            roster={teamRoster}
            onPick={(id) => setScorerId(id)}
          />
        </div>
      )}

      {step === "assists" && teamId && scorerId && (
        <div className="space-y-3">
          <StepBack onBack={() => { setScorerId(null); setA1(null); setA2(null); }} label={teamLabel ?? ""} />
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
  homeRoster,
  awayRoster,
  onCancel,
  onSubmit,
}: {
  game: Game;
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
  const [teamId, setTeamId] = useState<string | null>(null);
  const [offenderId, setOffenderId] = useState<string | null>(null);
  const [penaltyType, setPenaltyType] = useState<PenaltyType | null>(null);
  const [otherText, setOtherText] = useState("");
  const [shotTakerId, setShotTakerId] = useState<string | null>(null);
  const [shotResult, setShotResult] = useState<"goal" | "saved" | null>(null);

  const committingRoster =
    teamId === game.homeTeam.id
      ? homeRoster
      : teamId === game.awayTeam.id
        ? awayRoster
        : [];
  const opposingRoster =
    teamId === game.homeTeam.id
      ? awayRoster
      : teamId === game.awayTeam.id
        ? homeRoster
        : [];
  const teamLabel =
    teamId === game.homeTeam.id
      ? game.homeTeam.name
      : teamId === game.awayTeam.id
        ? game.awayTeam.name
        : null;
  const opposingLabel =
    teamId === game.homeTeam.id
      ? game.awayTeam.name
      : teamId === game.awayTeam.id
        ? game.homeTeam.name
        : null;

  const step: "team" | "offender" | "type" | "shot" =
    !teamId ? "team" : !offenderId ? "offender" : !penaltyType ? "type" : "shot";

  const canSubmit =
    !!teamId &&
    !!offenderId &&
    !!penaltyType &&
    (penaltyType !== "other" || otherText.trim().length > 0) &&
    !!shotTakerId &&
    !!shotResult;

  return (
    <Sheet title="Record Penalty" onCancel={onCancel}>
      {step === "team" && (
        <>
          <p className="eyebrow text-[10px]">Committing team</p>
          <TeamPicker game={game} onPick={setTeamId} />
        </>
      )}

      {step === "offender" && teamId && (
        <div className="space-y-2">
          <StepBack onBack={() => setTeamId(null)} label={`${teamLabel} committed`} />
          <p className="eyebrow text-[10px]">Offender</p>
          <PlayerGrid roster={committingRoster} onPick={setOffenderId} />
        </div>
      )}

      {step === "type" && teamId && offenderId && (
        <div className="space-y-2">
          <StepBack onBack={() => setOffenderId(null)} label={teamLabel ?? ""} />
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

      {step === "shot" && teamId && offenderId && penaltyType && (
        <div className="space-y-3">
          <StepBack
            onBack={() => {
              setPenaltyType(null);
              setOtherText("");
              setShotTakerId(null);
              setShotResult(null);
            }}
            label={teamLabel ?? ""}
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

function TeamPicker({ game, onPick }: { game: Game; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[game.awayTeam, game.homeTeam].map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className="min-h-[72px] panel-bare p-3 flex items-center gap-2 text-left border-l-[3px] hover:border-l-[5px] transition-all"
          style={{ borderLeftColor: t.color }}
        >
          <span className="font-display text-[16px] tracking-[0.06em] truncate">
            {t.name}
          </span>
        </button>
      ))}
    </div>
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
