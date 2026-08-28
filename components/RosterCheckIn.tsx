"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createNewSub, startGame, updateRoster } from "@/app/score/[gameId]/actions";

type Position = "forward" | "defense" | "goalie";

type RosterPlayer = { id: string; name: string; position: Position };

type Team = { id: string; name: string; color: string };

type Props = {
  gameId: string;
  homeTeam: Team;
  awayTeam: Team;
  homeRoster: RosterPlayer[];
  awayRoster: RosterPlayer[];
  addableSubs: { id: string; name: string }[];
  // "start" → first-time check-in; submit flips game to live.
  // "update" → editing a live or final game's lineup.
  mode?: "start" | "update";
  // Players already pre-checked. In update mode, callers seed this with
  // the union of existing game_appearances. Defaults to "all roster players".
  initiallyChecked?: string[];
  // Player IDs that can't be removed (have game events). Update mode only.
  lockedPlayerIds?: string[];
  // After-success redirect (e.g. back to /score/[gameId]). Defaults to refresh.
  redirectTo?: string;
};

type CheckInPlayer = RosterPlayer & { isSub: boolean };

export function RosterCheckIn({
  gameId,
  homeTeam,
  awayTeam,
  homeRoster,
  awayRoster,
  addableSubs,
  mode = "start",
  initiallyChecked,
  lockedPlayerIds,
  redirectTo,
}: Props) {
  const locked = useMemo(() => new Set(lockedPlayerIds ?? []), [lockedPlayerIds]);
  const [home, setHome] = useState<CheckInPlayer[]>(
    () => homeRoster.map((p) => ({ ...p, isSub: false })),
  );
  const [away, setAway] = useState<CheckInPlayer[]>(
    () => awayRoster.map((p) => ({ ...p, isSub: false })),
  );
  const [checked, setChecked] = useState<Set<string>>(
    () =>
      initiallyChecked
        ? new Set(initiallyChecked)
        : new Set([...homeRoster.map((p) => p.id), ...awayRoster.map((p) => p.id)]),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const homeGoalies = useMemo(
    () => home.filter((p) => checked.has(p.id) && p.position === "goalie").length,
    [home, checked],
  );
  const awayGoalies = useMemo(
    () => away.filter((p) => checked.has(p.id) && p.position === "goalie").length,
    [away, checked],
  );
  const homeChecked = useMemo(() => home.filter((p) => checked.has(p.id)).length, [home, checked]);
  const awayChecked = useMemo(() => away.filter((p) => checked.has(p.id)).length, [away, checked]);

  const canStart =
    homeGoalies >= 1 && awayGoalies >= 1 && homeChecked > 0 && awayChecked > 0 && !pending;

  const toggle = (id: string) => {
    if (locked.has(id) && checked.has(id)) return; // can't uncheck a locked player
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const usedSubIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of home) if (p.isSub) ids.add(p.id);
    for (const p of away) if (p.isSub) ids.add(p.id);
    return ids;
  }, [home, away]);

  const onAddExistingSub = (
    teamSide: "home" | "away",
    playerId: string,
    name: string,
    position: Position,
  ) => {
    const setter = teamSide === "home" ? setHome : setAway;
    setter((cur) => {
      // If player already added (e.g. user adjusts position), update position.
      const idx = cur.findIndex((p) => p.id === playerId);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], position };
        return next;
      }
      return [...cur, { id: playerId, name, position, isSub: true }];
    });
    setChecked((cur) => new Set(cur).add(playerId));
  };

  const onCreateAndAddSub = async (
    teamSide: "home" | "away",
    firstName: string,
    lastName: string,
    position: Position,
  ) => {
    setError(null);
    const res = await createNewSub({ firstName, lastName, position });
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
      return false;
    }
    const setter = teamSide === "home" ? setHome : setAway;
    setter((cur) => [
      ...cur,
      {
        id: res.player.id,
        name: `${res.player.first_name} ${res.player.last_name}`,
        position: res.player.position,
        isSub: true,
      },
    ]);
    setChecked((cur) => new Set(cur).add(res.player.id));
    return true;
  };

  const onSubmit = () => {
    setError(null);
    const homeRosterPayload = home
      .filter((p) => checked.has(p.id))
      .map((p) => ({ playerId: p.id, position: p.position, isSub: p.isSub }));
    const awayRosterPayload = away
      .filter((p) => checked.has(p.id))
      .map((p) => ({ playerId: p.id, position: p.position, isSub: p.isSub }));

    startTransition(async () => {
      const action = mode === "update" ? updateRoster : startGame;
      const res = await action({
        gameId,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeRoster: homeRosterPayload,
        awayRoster: awayRosterPayload,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-5">
      <TeamRoster
        team={awayTeam}
        side="away"
        players={away}
        checked={checked}
        locked={locked}
        onToggle={toggle}
        addableSubs={addableSubs.filter((p) => !usedSubIds.has(p.id))}
        onAddExistingSub={(id, name, pos) => onAddExistingSub("away", id, name, pos)}
        onCreateNewSub={(f, l, pos) => onCreateAndAddSub("away", f, l, pos)}
        goalieCount={awayGoalies}
      />
      <TeamRoster
        team={homeTeam}
        side="home"
        players={home}
        checked={checked}
        locked={locked}
        onToggle={toggle}
        addableSubs={addableSubs.filter((p) => !usedSubIds.has(p.id))}
        onAddExistingSub={(id, name, pos) => onAddExistingSub("home", id, name, pos)}
        onCreateNewSub={(f, l, pos) => onCreateAndAddSub("home", f, l, pos)}
        goalieCount={homeGoalies}
      />

      {error && (
        <div className="panel-bare p-3 text-goal text-[13px]">{error}</div>
      )}

      <div className="sticky bottom-3 z-10">
        <button
          type="button"
          disabled={!canStart}
          onClick={onSubmit}
          className={`w-full min-h-[52px] font-display text-[18px] tracking-[0.12em] rounded-[2px] border transition-colors ${
            canStart
              ? "bg-goal text-board border-goal hover:bg-goal-glow"
              : "bg-board-3 text-ink-faint border-rule cursor-not-allowed"
          }`}
        >
          {pending
            ? mode === "update"
              ? "Saving…"
              : "Starting…"
            : mode === "update"
              ? "Update Lineup"
              : "Start Game"}
        </button>
        {!canStart && !pending && (
          <p className="eyebrow text-ink-faint mt-2 text-center">
            {homeGoalies < 1 || awayGoalies < 1
              ? "Each team needs a goalie checked in"
              : "Each team needs at least one player"}
          </p>
        )}
      </div>
    </div>
  );
}

function TeamRoster({
  team,
  side,
  players,
  checked,
  locked,
  onToggle,
  addableSubs,
  onAddExistingSub,
  onCreateNewSub,
  goalieCount,
}: {
  team: Team;
  side: "home" | "away";
  players: CheckInPlayer[];
  checked: Set<string>;
  locked: Set<string>;
  onToggle: (id: string) => void;
  addableSubs: { id: string; name: string }[];
  onAddExistingSub: (id: string, name: string, position: Position) => void;
  onCreateNewSub: (firstName: string, lastName: string, position: Position) => Promise<boolean>;
  goalieCount: number;
}) {
  const checkedCount = players.filter((p) => checked.has(p.id)).length;
  const sideLabel = side === "home" ? "Home" : "Away";
  return (
    <section className="panel p-3 sm:p-4 space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="inline-block w-1 h-4 rounded-[1px] shrink-0 translate-y-[2px]"
            style={{ backgroundColor: team.color }}
            aria-hidden
          />
          <span className="font-display text-[18px] tracking-[0.06em] truncate">
            {team.name}
          </span>
          <span className="eyebrow text-[10px] text-ink-faint">{sideLabel}</span>
        </div>
        <span className="eyebrow text-[10px] text-ink-dim shrink-0">
          {checkedCount} in · {goalieCount} G
        </span>
      </header>

      <ul className="divide-y divide-rule">
        {players.map((p) => {
          const isChecked = checked.has(p.id);
          const isLocked = locked.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                aria-pressed={isChecked}
                disabled={isLocked && isChecked}
                title={isLocked ? "Has events recorded — undo events to remove" : undefined}
                className={`w-full min-h-[44px] py-2 px-1 flex items-center gap-3 text-left transition-colors ${
                  isChecked ? "text-ink" : "text-ink-faint"
                } ${isLocked && isChecked ? "cursor-not-allowed" : ""}`}
              >
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded-[2px] border flex items-center justify-center text-[11px] font-mono ${
                    isChecked
                      ? "bg-ice text-board border-ice"
                      : "border-rule-strong"
                  }`}
                  aria-hidden
                >
                  {isChecked ? "✓" : ""}
                </span>
                <span className="flex-1 truncate text-[14px]">{p.name}</span>
                {isLocked && (
                  <span className="eyebrow text-[10px] text-ink-faint" aria-hidden>🔒</span>
                )}
                <span
                  className={`eyebrow text-[10px] ${
                    p.position === "goalie" ? "text-ice" : "text-ink-faint"
                  }`}
                >
                  {posLabel(p.position)}
                </span>
                {p.isSub && (
                  <span className="eyebrow text-[10px] text-goal">SUB</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <SubControls
        addableSubs={addableSubs}
        onAddExistingSub={onAddExistingSub}
        onCreateNewSub={onCreateNewSub}
      />
    </section>
  );
}

function SubControls({
  addableSubs,
  onAddExistingSub,
  onCreateNewSub,
}: {
  addableSubs: { id: string; name: string }[];
  onAddExistingSub: (id: string, name: string, position: Position) => void;
  onCreateNewSub: (firstName: string, lastName: string, position: Position) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"closed" | "search" | "new">("closed");
  const [searchQuery, setSearchQuery] = useState("");
  // After picking a player from search, hold them while the user picks a position.
  const [pickedExisting, setPickedExisting] = useState<{ id: string; name: string } | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [position, setPosition] = useState<Position>("forward");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return addableSubs.slice(0, 8);
    return addableSubs.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, addableSubs]);

  if (mode === "closed") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("search")}
          className="flex-1 min-h-[40px] eyebrow text-[11px] border border-rule rounded-[2px] hover:border-rule-strong hover:text-ink text-ink-dim"
        >
          + Add sub
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className="flex-1 min-h-[40px] eyebrow text-[11px] border border-rule rounded-[2px] hover:border-rule-strong hover:text-ink text-ink-dim"
        >
          + New sub
        </button>
      </div>
    );
  }

  if (mode === "search") {
    if (pickedExisting) {
      return (
        <div className="space-y-2 panel-bare p-3">
          <div className="text-[14px] text-ink">
            Position for <span className="font-semibold">{pickedExisting.name}</span>
          </div>
          <div className="flex gap-1">
            {(["forward", "defense", "goalie"] as Position[]).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => {
                  onAddExistingSub(pickedExisting.id, pickedExisting.name, pos);
                  setMode("closed");
                  setSearchQuery("");
                  setPickedExisting(null);
                }}
                className="flex-1 min-h-[40px] eyebrow text-[11px] border border-rule rounded-[2px] hover:border-rule-strong hover:text-ink text-ink-dim"
              >
                {posLabel(pos)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPickedExisting(null)}
            className="eyebrow text-[10px] text-ink-dim hover:text-ink min-h-[40px] w-full"
          >
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2 panel-bare p-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search players…"
            className="flex-1 min-h-[40px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[14px] text-ink placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={() => {
              setMode("closed");
              setSearchQuery("");
            }}
            className="eyebrow text-[10px] text-ink-dim hover:text-ink min-h-[40px] px-2"
          >
            Cancel
          </button>
        </div>
        <ul className="space-y-1">
          {filtered.length === 0 ? (
            <li className="eyebrow text-[10px] text-ink-faint">No matches</li>
          ) : (
            filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPickedExisting(p)}
                  className="w-full min-h-[40px] text-left px-2 text-[14px] text-ink hover:bg-board-3 rounded-[2px]"
                >
                  {p.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  // mode === "new"
  return (
    <div className="space-y-2 panel-bare p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="First name"
          className="min-h-[40px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[14px] text-ink placeholder:text-ink-faint"
        />
        <input
          type="text"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder="Last name"
          className="min-h-[40px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[14px] text-ink placeholder:text-ink-faint"
        />
      </div>
      <div className="flex gap-1">
        {(["forward", "defense", "goalie"] as Position[]).map((pos) => (
          <button
            key={pos}
            type="button"
            onClick={() => setPosition(pos)}
            aria-pressed={position === pos}
            className={`flex-1 min-h-[40px] eyebrow text-[11px] border rounded-[2px] ${
              position === pos
                ? "bg-board-3 text-ink border-rule-strong"
                : "border-rule text-ink-dim"
            }`}
          >
            {posLabel(pos)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !first.trim() || !last.trim()}
          onClick={async () => {
            setBusy(true);
            const ok = await onCreateNewSub(first, last, position);
            setBusy(false);
            if (ok) {
              setMode("closed");
              setFirst("");
              setLast("");
              setPosition("forward");
            }
          }}
          className="flex-1 min-h-[40px] eyebrow text-[11px] bg-ice text-board rounded-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("closed");
            setFirst("");
            setLast("");
          }}
          className="eyebrow text-[10px] text-ink-dim hover:text-ink min-h-[40px] px-3"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function posLabel(p: Position): string {
  if (p === "forward") return "FWD";
  if (p === "defense") return "DEF";
  return "G";
}
