"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";
import { Disclosure } from "./Disclosure";
import { ScrollFade } from "./ScrollFade";
import {
  SkaterTable,
  GoalieTable,
  type Skater,
  type Goalie,
} from "./StatsTables";

type Team = { id: string; name: string; slug: string; color: string };

type GameMeta = {
  id: string;
  kind: "regular" | "playoff";
  home_team_id: string | null;
  home_score: number;
  away_score: number;
  decided_in: string | null;
};

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
  teams: Team[];
  /** The selected season's recap (null for an upcoming season). */
  recap: StatsRecapLink | null;
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
  teams,
  recap,
  games = [],
  roster = [],
  appearances = [],
  events = [],
  precomputed,
}: Props) {
  const [position, setPosition] = useState<PositionFilter>("all");
  const [kind, setKind] = useState<KindFilter>("regular");
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

    const gameById = new Map(games.map((g) => [g.id, g]));
    const includeGame = (gid: string) => {
      if (kind === "all") return true;
      return gameById.get(gid)?.kind === kind;
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
          ps_saved = 0,
          w = 0,
          l = 0,
          otl = 0;
        for (const [gid, myTeam] of myGames) {
          const g = gameById.get(gid);
          if (!g) continue;
          const isHome = g.home_team_id === myTeam;
          const myScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          if (myScore > oppScore) w++;
          else if (g.decided_in === "ot" || g.decided_in === "shootout") otl++;
          else l++;
        }
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
        goaliesOut.push({ id: r.id, name: r.name, team: teamObj, gp, w, l, otl, ga, ps_faced, ps_saved });
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
        <SectionHeader
          eyebrow={`${seasonName} · League leaders`}
          title="Stats"
          size="lg"
          as="h1"
          action={
            <>
              {recap && (
                <Link
                  href={recap.href}
                  className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11 whitespace-nowrap"
                >
                  Recap <span aria-hidden className="ml-1">→</span>
                </Link>
              )}
              <Link
                href="/stats/all-time"
                className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11 whitespace-nowrap"
              >
                All-time <span aria-hidden className="ml-1">→</span>
              </Link>
            </>
          }
        />
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <LeaderTile label="Goals" leader={leaders.goals} stat={leaders.goals?.goals ?? 0} />
          <LeaderTile label="Assists" leader={leaders.assists} stat={leaders.assists?.assists ?? 0} />
          <LeaderTile label="Points" leader={leaders.points} stat={leaders.points?.points ?? 0} />
        </div>
        {recap && <RecapCard recap={recap} />}
      </div>

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

      <section className="rise delay-1">
        <SectionHeader
          eyebrow={`${skaters.length} ${skaters.length === 1 ? "skater" : "skaters"}`}
          title="Skater stats"
          action={
            <a
              href="#goalies"
              className="sm:hidden text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11"
            >
              Goalies <span aria-hidden className="ml-1">↓</span>
            </a>
          }
        />
        <SkaterTable rows={skaters} />
        <Legend>
          Tap a column header to sort. PEN = penalties committed; PS = penalty shots taken; PSG = penalty shots scored.
        </Legend>
      </section>

      <section id="goalies" className="rise delay-2">
        <SectionHeader eyebrow="Between the pipes" title="Goalies" />
        <GoalieTable rows={goalies} />
        <Legend>
          W-L-OTL isn&apos;t available for imported seasons. GA includes penalty-shot goals. PSF = penalty shots faced; PSV = penalty shots saved. Position filter does not apply.
        </Legend>
      </section>
    </>
  );
}

// Collapsed-by-default abbreviations key, so the tables sit higher on the page.
function Legend({ children }: { children: ReactNode }) {
  return (
    <Disclosure label="Legend" className="mt-2">
      <p>{children}</p>
    </Disclosure>
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
    <div role="toolbar" aria-label="Filter stats" className="rise delay-1 panel-bare py-3">
      <ScrollFade className="px-3 sm:px-4">
      {/* Phones: one swipeable row; wraps from sm. */}
      <div className="flex flex-nowrap sm:flex-wrap items-center gap-x-5 gap-y-3 w-max sm:w-auto">
        <FilterField label="Position">
          <SegmentedFilter<PositionFilter>
            value={position}
            onChange={setPosition}
            options={[
              { value: "all", label: "All" },
              { value: "forward", label: "Forwards" },
              { value: "defense", label: "Defense" },
            ]}
          />
        </FilterField>
        {showKind && (
          <FilterField label="Games">
            <SegmentedFilter<KindFilter>
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "All" },
                { value: "regular", label: "Regular" },
                { value: "playoff", label: "Playoffs" },
              ]}
            />
          </FilterField>
        )}
        <FilterField label="Team">
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            aria-label="Team"
            className={`border text-[14px] font-semibold px-3 rounded-md min-h-[44px] max-w-[200px] sm:max-w-[220px] transition-colors ${
              teamId === "all" ? "bg-board-2 border-rule-strong text-ink" : "bg-ice border-ice text-board"
            }`}
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
          className="ml-auto px-3 text-[14px] font-semibold min-h-[44px] rounded-md text-ice hover:text-ink disabled:text-ink-faint disabled:opacity-60 transition-colors"
        >
          Reset
        </button>
      </div>
      </ScrollFade>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={label}>
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

function LeaderTile({ label, leader, stat }: { label: string; leader: Skater | null; stat: number }) {
  return (
    <div className="panel p-3 sm:p-5 flex flex-col gap-1.5 min-w-0">
      <div className="eyebrow">{label}</div>
      {leader ? (
        <>
          <div className="digit text-[32px] sm:text-[44px] leading-none text-gold">{stat}</div>
          <Link
            href={`/players/${leader.id}`}
            className="flex items-center min-h-[44px] text-[14px] sm:text-[16px] font-semibold leading-5 text-ink hover:text-ice transition-colors"
          >
            <span className="line-clamp-2 break-words">{leader.name}</span>
          </Link>
          {leader.team && (
            <div className="flex items-start gap-1.5 min-w-0">
              <span aria-hidden className="swatch mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: leader.team.color }} />
              <span className="text-[12px] sm:text-[13px] leading-4 text-ink-faint">{leader.team.name}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="digit text-[32px] sm:text-[44px] leading-none text-ink-faint">—</div>
          <div className="text-[13px] text-ink-faint">No leader yet</div>
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
    <div className="inline-flex border border-rule-strong rounded-md overflow-hidden">
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 min-w-[44px] text-[14px] font-semibold transition-colors min-h-[44px] ${
              active ? "bg-ice text-board" : "text-ink-dim hover:text-ink hover:bg-board-3"
            } ${i > 0 ? "border-l border-rule-strong" : ""}`}
            aria-pressed={active}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export type StatsRecapLink = {
  href: string;
  seasonName: string;
  champion: { name: string; color: string } | null;
  inProgress: boolean;
};

// Slim link to the season recap, where award winners now live.
function RecapCard({ recap }: { recap: StatsRecapLink }) {
  return (
    <Link
      href={recap.href}
      className="panel mt-3 flex items-center gap-3 p-4 hover:bg-board-hover hover:border-rule-strong transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="eyebrow block">Season recap</span>
        <span className="mt-0.5 block text-[15px] font-semibold text-ink">{recap.seasonName}</span>
        {recap.champion ? (
          <span className="flex items-center gap-1.5 text-[14px] text-ink-dim">
            <span aria-hidden className="swatch h-2 w-2 rounded-full" style={{ background: recap.champion.color }} />
            Champions: {recap.champion.name}
          </span>
        ) : (
          <span className="block text-[14px] text-ink-dim">
            {recap.inProgress ? "In progress — current leaders" : "Awards, standings and highlights"}
          </span>
        )}
      </span>
      <span aria-hidden className="text-[18px] text-ink-faint">→</span>
    </Link>
  );
}
