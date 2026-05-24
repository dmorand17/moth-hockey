"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { TeamBadge } from "./TeamBadge";
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
  teams: Team[];
  games: GameMeta[];
  roster: RosterEntry[];
  appearances: StatsAppearance[];
  events: StatsEvent[];
};

type PositionFilter = "all" | "forward" | "defense";
type KindFilter = "all" | "regular" | "playoff";

export function StatsExplorer({ teams, games, roster, appearances, events }: Props) {
  const [position, setPosition] = useState<PositionFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [teamId, setTeamId] = useState<string>("all");

  const { skaters, goalies } = useMemo(() => {
    const gameKindById = new Map(games.map((g) => [g.id, g.kind]));
    const includeGame = (gid: string) => {
      if (kind === "all") return true;
      return gameKindById.get(gid) === kind;
    };

    // Per-player included games + the team they played for in each
    const teamByGameByPlayer = new Map<string, Map<string, string>>();
    for (const a of appearances) {
      if (!includeGame(a.game_id)) continue;
      if (teamId !== "all" && a.team_id !== teamId) continue;
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

  const filterCount =
    (position !== "all" ? 1 : 0) + (kind !== "all" ? 1 : 0) + (teamId !== "all" ? 1 : 0);

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
      <FilterBar
        teams={teams}
        position={position}
        setPosition={setPosition}
        kind={kind}
        setKind={setKind}
        teamId={teamId}
        setTeamId={setTeamId}
        filterCount={filterCount}
        goalsLeader={goalsLeader}
        pointsLeader={pointsLeader}
      />

      <section className="rise delay-1 mt-5">
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

function FilterBar({
  teams,
  position,
  setPosition,
  kind,
  setKind,
  teamId,
  setTeamId,
  filterCount,
  goalsLeader,
  pointsLeader,
}: {
  teams: Team[];
  position: PositionFilter;
  setPosition: (p: PositionFilter) => void;
  kind: KindFilter;
  setKind: (k: KindFilter) => void;
  teamId: string;
  setTeamId: (id: string) => void;
  filterCount: number;
  goalsLeader: Skater | null;
  pointsLeader: Skater | null;
}) {
  const [open, setOpen] = useState(filterCount > 0);

  return (
    <div className="panel-bare p-3 sm:p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-5 min-w-0">
        <LeaderCard label="Goals Leader" leader={goalsLeader} stat={goalsLeader?.goals ?? 0} />
        <LeaderCard label="Points Leader" leader={pointsLeader} stat={pointsLeader?.points ?? 0} />
      </div>
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="stats-filter-panel"
          className={`px-3 py-1.5 border rounded-[2px] text-[12px] font-mono uppercase tracking-[0.12em] min-h-[44px] transition-colors ${
            filterCount > 0
              ? "border-rule-strong bg-board-3 text-ink"
              : "border-rule-strong text-ink-dim hover:text-ink"
          }`}
        >
          {open ? "Hide" : "Filter"}
          {filterCount > 0 && <span className="ml-1.5 text-ice">({filterCount})</span>}
        </button>
      </div>
      {open && (
        <div
          id="stats-filter-panel"
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end pt-3 border-t border-rule"
        >
          <SegmentedFilter<PositionFilter>
            label="Position"
            value={position}
            onChange={setPosition}
            clearValue="all"
            options={[
              { value: "forward", label: "Fwd" },
              { value: "defense", label: "Def" },
            ]}
          />
          <SegmentedFilter<KindFilter>
            label="Kind"
            value={kind}
            onChange={setKind}
            clearValue="all"
            options={[
              { value: "regular", label: "Reg." },
              { value: "playoff", label: "Playoff" },
            ]}
          />
          <div className="flex flex-col gap-1 min-w-0 sm:max-w-[220px] flex-1">
            <label className="eyebrow text-[10px]">Team</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="bg-board-2 border border-rule-strong text-ink text-[12.5px] font-mono uppercase tracking-[0.1em] px-2 py-1.5 rounded-[2px] min-h-[44px]"
            >
              <option value="all">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderCard({
  label,
  leader,
  stat,
}: {
  label: string;
  leader: Skater | null;
  stat: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="eyebrow text-[10px]">{label}</span>
      {leader ? (
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="digit text-3xl sm:text-4xl text-ink tnum shrink-0">{stat}</span>
          <div className="min-w-0 flex flex-col gap-0.5">
            <Link
              href={`/players/${leader.id}`}
              className="inline-flex items-center min-h-11 truncate text-[14px] sm:text-[15px] text-ink hover:text-ice transition-colors"
            >
              {leader.name}
            </Link>
            {leader.team && <TeamBadge {...leader.team} size="sm" />}
          </div>
        </div>
      ) : (
        <span className="text-ink-dim text-[13px]">—</span>
      )}
    </div>
  );
}

function SegmentedFilter<T extends string>({
  label,
  value,
  onChange,
  options,
  clearValue,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  clearValue?: T;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="eyebrow text-[10px]">{label}</span>
      <div className="inline-flex border border-rule-strong rounded-[2px] overflow-hidden">
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
              className={`px-3 py-1.5 text-[12px] font-mono uppercase tracking-[0.12em] transition-colors min-h-[44px] ${
                active ? "bg-board-3 text-ink" : "text-ink-dim hover:text-ink"
              } ${i > 0 ? "border-l border-rule" : ""}`}
              aria-pressed={active}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
