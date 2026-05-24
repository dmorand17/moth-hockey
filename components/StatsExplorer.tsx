"use client";

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
}: {
  teams: Team[];
  position: PositionFilter;
  setPosition: (p: PositionFilter) => void;
  kind: KindFilter;
  setKind: (k: KindFilter) => void;
  teamId: string;
  setTeamId: (id: string) => void;
  filterCount: number;
}) {
  const reset = () => {
    setPosition("all");
    setKind("all");
    setTeamId("all");
  };

  return (
    <div className="panel-bare p-3 sm:p-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
      <SegmentedFilter<PositionFilter>
        label="Position"
        value={position}
        onChange={setPosition}
        options={[
          { value: "all", label: "All" },
          { value: "forward", label: "Fwd" },
          { value: "defense", label: "Def" },
        ]}
      />
      <SegmentedFilter<KindFilter>
        label="Kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "all", label: "All" },
          { value: "regular", label: "Reg." },
          { value: "playoff", label: "Playoff" },
        ]}
      />
      <div className="flex flex-col gap-1 min-w-0 flex-1 sm:max-w-[220px]">
        <label className="eyebrow text-[10px]">Team</label>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="bg-board-2 border border-rule-strong text-ink text-[12.5px] font-mono uppercase tracking-[0.1em] px-2 py-1.5 rounded-[2px] min-h-[36px]"
        >
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {filterCount > 0 && (
        <button
          type="button"
          onClick={reset}
          className="eyebrow hover:text-ink transition-colors self-start sm:self-end pb-1.5 whitespace-nowrap"
        >
          Reset ({filterCount})
        </button>
      )}
    </div>
  );
}

function SegmentedFilter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="eyebrow text-[10px]">{label}</span>
      <div className="inline-flex border border-rule-strong rounded-[2px] overflow-hidden">
        {options.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
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
    </div>
  );
}
