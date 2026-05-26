"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";
import { SeasonSelect } from "./SeasonSelect";
import { AwardWinners, type AwardWinnerGroup } from "./AwardWinners";
import {
  SkaterTable,
  GoalieTable,
  type Skater,
  type Goalie,
} from "./StatsTables";

type Team = { id: string; name: string; slug: string; color: string };

type GameMeta = { id: string; kind: "regular" | "playoff" };

type SeasonOption = { id: string; name: string };

// Historical (aggregated) seasons arrive pre-aggregated rather than derived
// from events; rows carry the extra fields needed for the position/team filters.
export type PrecomputedSkater = Skater & {
  position: "forward" | "defense" | "goalie";
  teamId?: string;
};
export type PrecomputedGoalie = Goalie & { teamId?: string };

type RosterEntry = {
  id: string;
  name: string;
  position: "forward" | "defense" | "goalie";
  team?: { id: string; name: string; slug: string; color: string };
};

export type StatsEvent = {
  game_id: string;
  team_id: string;
  type: "goal" | "penalty";
  player_id: string | null;
  assist1_player_id: string | null;
  assist2_player_id: string | null;
  penalty_shot_taker_id: string | null;
  penalty_shot_result: "goal" | "saved" | null;
};

export type StatsAppearance = {
  game_id: string;
  player_id: string;
  team_id: string;
};

type Props = {
  seasonName: string;
  seasons: SeasonOption[];
  selectedSeasonId: string;
  teams: Team[];
  awardWinners: AwardWinnerGroup[];
  // Awards aren't decided yet (current, in-progress season with no awards on file).
  awardsPending: boolean;
  // Live (current-season) inputs — stats derive from game events.
  games?: GameMeta[];
  roster?: RosterEntry[];
  appearances?: StatsAppearance[];
  events?: StatsEvent[];
  // Historical (past-season) inputs — already aggregated, no events.
  precomputed?: { skaters: PrecomputedSkater[]; goalies: PrecomputedGoalie[] };
};

type PositionFilter = "all" | "forward" | "defense";
type KindFilter = "all" | "regular" | "playoff";

export function StatsExplorer({
  seasonName,
  seasons,
  selectedSeasonId,
  teams,
  awardWinners,
  awardsPending,
  games = [],
  roster = [],
  appearances = [],
  events = [],
  precomputed,
}: Props) {
  const [position, setPosition] = useState<PositionFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [teamId, setTeamId] = useState<string>("all");

  const { skaters, goalies } = useMemo(() => {
    if (precomputed) {
      const skatersOut = precomputed.skaters.filter(
        (s) =>
          (position === "all" || s.position === position) &&
          (teamId === "all" || s.teamId === teamId),
      );
      const goaliesOut = precomputed.goalies.filter(
        (g) => teamId === "all" || g.teamId === teamId,
      );
      return { skaters: skatersOut, goalies: goaliesOut };
    }

    const gameKindById = new Map(games.map((g) => [g.id, g.kind]));
    const includeGame = (gid: string) => {
      if (kind === "all") return true;
      return gameKindById.get(gid) === kind;
    };

    // Player → their season roster team id. Used to drop appearances where the
    // player subbed for a team other than their own — those events still
    // appear in the boxscore but don't roll into season totals.
    const rosterTeamByPlayer = new Map<string, string | undefined>(
      roster.map((r) => [r.id, r.team?.id]),
    );

    // Per-player included games + the team they played for in each.
    const teamByGameByPlayer = new Map<string, Map<string, string>>();
    for (const a of appearances) {
      if (!includeGame(a.game_id)) continue;
      if (teamId !== "all" && a.team_id !== teamId) continue;
      // Skip sub-for-other-team appearances: the player's roster team for
      // this season must match the team they played for in this game.
      const rosterTeam = rosterTeamByPlayer.get(a.player_id);
      if (!rosterTeam || rosterTeam !== a.team_id) continue;
      if (!teamByGameByPlayer.has(a.player_id)) {
        teamByGameByPlayer.set(a.player_id, new Map());
      }
      teamByGameByPlayer.get(a.player_id)!.set(a.game_id, a.team_id);
    }

    const skatersOut: Skater[] = [];
    const goaliesOut: Goalie[] = [];

    for (const r of roster) {
      const myGames = teamByGameByPlayer.get(r.id);
      if (!myGames || myGames.size === 0) continue;

      const teamObj = r.team
        ? { name: r.team.name, slug: r.team.slug, color: r.team.color }
        : undefined;
      const gp = myGames.size;

      if (r.position === "goalie") {
        let ga = 0,
          ps_faced = 0,
          ps_saved = 0;
        for (const e of events) {
          if (!myGames.has(e.game_id)) continue;
          const myTeam = myGames.get(e.game_id);
          if (e.type === "goal" && e.team_id !== myTeam) ga++;
          else if (e.type === "penalty" && e.team_id === myTeam) {
            ps_faced++;
            if (e.penalty_shot_result === "saved") ps_saved++;
            else if (e.penalty_shot_result === "goal") ga++;
          }
        }
        goaliesOut.push({ id: r.id, name: r.name, team: teamObj, gp, ga, ps_faced, ps_saved });
      } else {
        if (position !== "all" && r.position !== position) continue;
        let goals = 0,
          assists = 0,
          penalties = 0,
          ps_taken = 0,
          ps_made = 0;
        for (const e of events) {
          if (!myGames.has(e.game_id)) continue;
          if (e.type === "goal") {
            if (e.player_id === r.id) goals++;
            if (e.assist1_player_id === r.id || e.assist2_player_id === r.id) assists++;
          } else if (e.type === "penalty") {
            if (e.player_id === r.id) penalties++;
            if (e.penalty_shot_taker_id === r.id) {
              ps_taken++;
              if (e.penalty_shot_result === "goal") ps_made++;
            }
          }
        }
        skatersOut.push({
          id: r.id,
          name: r.name,
          team: teamObj,
          gp,
          goals,
          assists,
          points: goals + assists,
          penalties,
          ps_taken,
          ps_made,
        });
      }
    }

    return { skaters: skatersOut, goalies: goaliesOut };
  }, [precomputed, appearances, events, games, roster, position, kind, teamId]);

  const leaders = useMemo(() => {
    const top = (key: "goals" | "assists" | "points"): Skater | null => {
      let best: Skater | null = null;
      for (const s of skaters) {
        if (s[key] === 0) continue;
        if (!best || s[key] > best[key]) best = s;
      }
      return best;
    };
    return {
      goals: top("goals"),
      assists: top("assists"),
      points: top("points"),
    };
  }, [skaters]);

  return (
    <>
      <div className="rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SectionHeader
              eyebrow="The Numbers"
              title="Stats"
              subtitle={`${seasonName} · league leaders`}
              size="lg"
            />
          </div>
          <div className="mt-1 shrink-0">
            <SeasonSelect seasons={seasons} selectedId={selectedSeasonId} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <LeaderTile label="Goals" leader={leaders.goals} stat={leaders.goals?.goals ?? 0} accent="goal" />
          <LeaderTile label="Assists" leader={leaders.assists} stat={leaders.assists?.assists ?? 0} accent="ice" />
          <LeaderTile label="Points" leader={leaders.points} stat={leaders.points?.points ?? 0} accent="ink" />
        </div>
      </div>

      {(awardWinners.length > 0 || awardsPending) && (
        <section className="rise delay-1">
          <SectionHeader eyebrow="The Hardware" title="Award Winners" />
          {awardWinners.length > 0 ? (
            <AwardWinners awards={awardWinners} />
          ) : (
            <p className="eyebrow normal-case tracking-[0.06em] text-ink-faint">
              Awards are announced at the end of the season.
            </p>
          )}
        </section>
      )}

      <FilterBar
        teams={teams}
        position={position}
        setPosition={setPosition}
        kind={kind}
        setKind={setKind}
        teamId={teamId}
        setTeamId={setTeamId}
        showKind={!precomputed}
      />

      <section className="rise delay-1 mt-2">
        <div className="flex items-end justify-between gap-3 mb-3 sm:mb-5">
          <SectionHeader eyebrow="Skaters" title="Skater Stats" />
          <a
            href="#goalies"
            className="sm:hidden eyebrow shrink-0 inline-flex items-center min-h-11 px-3 rounded-[2px] border border-rule-strong bg-board-3 text-ice hover:border-ice/60 transition-colors"
          >
            Goalies ↓
          </a>
        </div>
        <SkaterTable rows={skaters} />
        <p className="eyebrow mt-3 normal-case tracking-[0.06em]">
          Tap any column header to sort. PEN = penalties committed; PS = penalty shots taken; PSG = penalty shots scored.
        </p>
      </section>

      <section id="goalies" className="rise delay-2 mt-5 sm:mt-10 scroll-mt-28">
        <SectionHeader eyebrow="Between The Pipes" title="Goalies" />
        <GoalieTable rows={goalies} />
        <p className="eyebrow mt-3 normal-case tracking-[0.06em]">
          GA includes penalty-shot goals. PSF = penalty shots faced; PSV = penalty shots saved. Position filter does not apply.
        </p>
      </section>
    </>
  );
}

function FilterBar({
  teams,
  position,
  setPosition,
  kind,
  setKind,
  teamId,
  setTeamId,
  showKind,
}: {
  teams: Team[];
  position: PositionFilter;
  setPosition: (p: PositionFilter) => void;
  kind: KindFilter;
  setKind: (k: KindFilter) => void;
  teamId: string;
  setTeamId: (id: string) => void;
  showKind: boolean;
}) {
  const hasActiveFilter = position !== "all" || (showKind && kind !== "all") || teamId !== "all";

  const resetAll = () => {
    setPosition("all");
    setKind("all");
    setTeamId("all");
  };

  return (
    <div className="rise delay-1 mt-4 sm:mt-5 panel-bare px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterField label="Pos">
          <SegmentedFilter<PositionFilter>
            value={position}
            onChange={setPosition}
            options={[
              { value: "all", label: "All" },
              { value: "forward", label: "Fwd" },
              { value: "defense", label: "Def" },
            ]}
          />
        </FilterField>
        {showKind && (
          <FilterField label="Type">
            <SegmentedFilter<KindFilter>
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "All" },
                { value: "regular", label: "Reg" },
                { value: "playoff", label: "Pyo" },
              ]}
            />
          </FilterField>
        )}
        <FilterField label="Team">
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="bg-board-2 border border-rule-strong text-ink text-[12.5px] font-mono uppercase tracking-[0.1em] px-2 py-1.5 rounded-[2px] min-h-[36px] max-w-[180px] sm:max-w-[220px]"
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </FilterField>
        <button
          type="button"
          onClick={resetAll}
          disabled={!hasActiveFilter}
          className="ml-auto px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.14em] min-h-[36px] text-ink-faint hover:text-goal disabled:opacity-30 disabled:hover:text-ink-faint transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="eyebrow text-[10px]">{label}</span>
      {children}
    </div>
  );
}

function LeaderTile({
  label,
  leader,
  stat,
  accent,
}: {
  label: string;
  leader: Skater | null;
  stat: number;
  accent: "goal" | "ice" | "ink";
}) {
  const statColor = accent === "goal" ? "text-goal" : accent === "ice" ? "text-ice" : "text-ink";
  const labelColor = accent === "goal" ? "text-goal" : accent === "ice" ? "text-ice" : "text-ink-dim";

  return (
    <div className="scoreboard p-3 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[140px] relative overflow-hidden">
      <div className={`eyebrow ${labelColor}`}>{label}</div>
      {leader ? (
        <>
          <div className={`digit text-[36px] sm:text-[52px] leading-none mt-1 ${statColor} tnum`}>
            {stat}
          </div>
          <div className="mt-2 min-w-0">
            <Link
              href={`/players/${leader.id}`}
              className="block truncate text-[13px] sm:text-[14px] text-ink hover:text-ice transition-colors font-medium"
            >
              {leader.name}
            </Link>
            {leader.team && (
              <div className="mt-1 inline-flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block w-[3px] h-[10px] rounded-[1px] shrink-0"
                  style={{ backgroundColor: leader.team.color, boxShadow: `0 0 6px ${leader.team.color}55` }}
                  aria-hidden
                />
                <span className="text-[11px] text-ink-dim truncate">{leader.team.name}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={`digit text-[36px] sm:text-[52px] leading-none mt-1 text-ink-faint tnum`}>—</div>
          <div className="mt-2 text-[11px] text-ink-faint eyebrow normal-case tracking-[0.06em]">No leader yet</div>
        </>
      )}
    </div>
  );
}

function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex border border-rule-strong rounded-[2px] overflow-hidden">
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-2.5 py-1.5 text-[11.5px] font-mono uppercase tracking-[0.12em] transition-colors min-h-[36px] ${
              active ? "bg-board-3 text-ice" : "text-ink-dim hover:text-ink"
            } ${i > 0 ? "border-l border-rule" : ""}`}
            aria-pressed={active}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
