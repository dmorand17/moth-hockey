"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionHeader } from "./SectionHeader";
import {
  SkaterTable,
  GoalieTable,
  type Skater,
  type Goalie,
} from "./StatsTables";

type Team = { id: string; name: string; slug: string; color: string };

type GameMeta = { id: string; kind: "regular" | "playoff" };

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
  teams: Team[];
  games: GameMeta[];
  roster: RosterEntry[];
  appearances: StatsAppearance[];
  events: StatsEvent[];
};

type PositionFilter = "all" | "forward" | "defense";
type KindFilter = "all" | "regular" | "playoff";

export function StatsExplorer({ seasonName, teams, games, roster, appearances, events }: Props) {
  const [position, setPosition] = useState<PositionFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [teamId, setTeamId] = useState<string>("all");

  const { skaters, goalies } = useMemo(() => {
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
  }, [appearances, events, games, roster, position, kind, teamId]);

  const goalsLeader = useMemo(() => {
    let best: Skater | null = null;
    for (const s of skaters) {
      if (s.goals === 0) continue;
      if (!best || s.goals > best.goals) best = s;
    }
    return best;
  }, [skaters]);

  const pointsLeader = useMemo(() => {
    let best: Skater | null = null;
    for (const s of skaters) {
      if (s.points === 0) continue;
      if (!best || s.points > best.points) best = s;
    }
    return best;
  }, [skaters]);

  return (
    <>
      <div className="rise">
        <SectionHeader
          eyebrow="The Numbers"
          title="Stats"
          subtitle={`${seasonName} · league leaders`}
          size="lg"
        />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 -mt-2 sm:-mt-3 pb-3 sm:pb-4 border-b border-rule">
          <LeaderLine label="Goals" leader={goalsLeader} stat={goalsLeader?.goals ?? 0} />
          <span className="text-ink-dim text-base hidden sm:inline" aria-hidden>·</span>
          <LeaderLine label="Pts" leader={pointsLeader} stat={pointsLeader?.points ?? 0} />
        </div>
      </div>

      <FilterBar
        teams={teams}
        position={position}
        setPosition={setPosition}
        kind={kind}
        setKind={setKind}
        teamId={teamId}
        setTeamId={setTeamId}
      />

      <section className="rise delay-1 mt-2">
        <SectionHeader eyebrow="Skaters" title="Skater Stats" />
        <SkaterTable rows={skaters} />
        <p className="eyebrow mt-3 normal-case tracking-[0.06em]">
          Tap any column header to sort. PEN = penalties committed; PS = penalty shots taken; PSG = penalty shots scored.
        </p>
      </section>

      <section className="rise delay-2 mt-6 sm:mt-10">
        <SectionHeader eyebrow="Between The Pipes" title="Goalies" />
        <GoalieTable rows={goalies} />
        <p className="eyebrow mt-3 normal-case tracking-[0.06em]">
          GA includes penalty-shot goals. PSF = penalty shots faced; PSV = penalty shots saved. Position filter does not apply.
        </p>
      </section>
    </>
  );
}

type FilterKey = "position" | "kind" | "team";

function FilterBar({
  teams,
  position,
  setPosition,
  kind,
  setKind,
  teamId,
  setTeamId,
}: {
  teams: Team[];
  position: PositionFilter;
  setPosition: (p: PositionFilter) => void;
  kind: KindFilter;
  setKind: (k: KindFilter) => void;
  teamId: string;
  setTeamId: (id: string) => void;
}) {
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);

  const toggle = (key: FilterKey) =>
    setOpenFilter((cur) => (cur === key ? null : key));

  const selectedTeam = teams.find((t) => t.id === teamId);
  const hasActiveFilter = position !== "all" || kind !== "all" || teamId !== "all";

  const resetAll = () => {
    setPosition("all");
    setKind("all");
    setTeamId("all");
    setOpenFilter(null);
  };

  return (
    <div className="mt-3 sm:mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="eyebrow text-[10px] mr-1">Filter:</span>
        <FilterToggle
          label="Position"
          active={position !== "all"}
          open={openFilter === "position"}
          onClick={() => toggle("position")}
          summary={position === "all" ? null : position === "forward" ? "Fwd" : "Def"}
        />
        <FilterToggle
          label="Team"
          active={teamId !== "all"}
          open={openFilter === "team"}
          onClick={() => toggle("team")}
          summary={selectedTeam?.name ?? null}
        />
        <FilterToggle
          label="Game Type"
          active={kind !== "all"}
          open={openFilter === "kind"}
          onClick={() => toggle("kind")}
          summary={kind === "all" ? null : kind === "regular" ? "Regular" : "Playoff"}
        />
        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetAll}
            className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-[0.12em] min-h-[36px] text-ink-dim hover:text-goal transition-colors"
          >
            Reset
          </button>
        )}
      </div>
      {openFilter === "position" && (
        <SegmentedFilter<PositionFilter>
          value={position}
          onChange={setPosition}
          clearValue="all"
          options={[
            { value: "forward", label: "Fwd" },
            { value: "defense", label: "Def" },
          ]}
        />
      )}
      {openFilter === "team" && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="self-start bg-board-2 border border-rule-strong text-ink text-[12.5px] font-mono uppercase tracking-[0.1em] px-2 py-1.5 rounded-[2px] min-h-[36px] sm:max-w-[260px]"
        >
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      {openFilter === "kind" && (
        <SegmentedFilter<KindFilter>
          value={kind}
          onChange={setKind}
          clearValue="all"
          options={[
            { value: "regular", label: "Regular" },
            { value: "playoff", label: "Playoff" },
          ]}
        />
      )}
    </div>
  );
}

function FilterToggle({
  label,
  active,
  open,
  onClick,
  summary,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onClick: () => void;
  summary: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`px-2 py-1.5 border rounded-[2px] text-[12px] font-mono uppercase tracking-[0.12em] min-h-[32px] transition-colors ${
        active || open
          ? "border-rule-strong bg-board-3 text-ink"
          : "border-transparent text-ink-faint hover:text-ink hover:border-rule"
      }`}
    >
      {label}
      {summary && <span className="ml-1.5 text-ice normal-case">{summary}</span>}
    </button>
  );
}

function LeaderLine({
  label,
  leader,
  stat,
}: {
  label: string;
  leader: Skater | null;
  stat: number;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="eyebrow text-[10px] text-goal">{label}</span>
      {leader ? (
        <>
          <span className="digit text-[14px] text-ink tnum leading-none">{stat}</span>
          <Link
            href={`/players/${leader.id}`}
            className="text-ink hover:text-ice transition-colors normal-case tracking-normal"
          >
            {leader.name}
          </Link>
          {leader.team && (
            <span className="inline-flex items-baseline gap-1 normal-case tracking-normal">
              <span
                className="inline-block w-[3px] h-[10px] rounded-[1px] shrink-0 translate-y-[1px]"
                style={{ backgroundColor: leader.team.color }}
                aria-hidden
              />
              <span className="text-[10px] text-ink-dim">{leader.team.name}</span>
            </span>
          )}
        </>
      ) : (
        <span className="text-ink-dim">—</span>
      )}
    </span>
  );
}

function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
  clearValue,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  clearValue?: T;
}) {
  return (
    <div className="self-start inline-flex border border-rule-strong rounded-[2px] overflow-hidden">
      {options.map((o, i) => {
        const active = o.value === value;
        const handleClick = () => {
          if (active && clearValue !== undefined) {
            onChange(clearValue);
          } else {
            onChange(o.value);
          }
        };
        return (
          <button
            key={o.value}
            type="button"
            onClick={handleClick}
            className={`px-3 py-1.5 text-[12px] font-mono uppercase tracking-[0.12em] transition-colors min-h-[36px] ${
              active ? "bg-board-3 text-ink" : "text-ink-dim hover:text-ink"
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
