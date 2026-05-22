import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";

type Skater = {
  id: string;
  name: string;
  team?: { name: string; slug: string; color: string };
  position: "forward" | "defense" | "goalie";
  gp: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ps_taken: number;
  ps_made: number;
};

type Goalie = {
  id: string;
  name: string;
  team?: { name: string; slug: string; color: string };
  gp: number;
  ga: number;
  ps_faced: number;
  ps_saved: number;
};

export default async function StatsPage() {
  const season = await getCurrentSeason();
  const supabase = await createSupabaseServerClient();

  const [{ data: rosters }, { data: appearances }, { data: events }] = await Promise.all([
    supabase
      .from("team_players")
      .select("position, jersey_number, player:player_id(id, first_name, last_name), team:team_id(name, slug, color), season:season_id(is_current)")
      .eq("season_id", season.id),
    supabase
      .from("game_appearances")
      .select("game_id, player_id, team_id, game:game_id(season_id, status)"),
    supabase
      .from("game_events")
      .select(
        "type, team_id, player_id, assist1_player_id, assist2_player_id, penalty_type, penalty_shot_result, penalty_shot_taker_id, game_id",
      ),
  ]);

  // Build maps keyed by player id
  type R = NonNullable<typeof rosters>[number];
  const byPlayer = new Map<string, R>();
  for (const r of rosters ?? []) {
    if (r.player) byPlayer.set(r.player.id, r);
  }

  // Filter appearances down to this season's final games
  const finalAppearances = (appearances ?? []).filter(
    (a) => a.game?.status === "final" && a.game?.season_id === season.id,
  );

  // gp + team-by-game per player
  const gpByPlayer = new Map<string, number>();
  const teamByGameByPlayer = new Map<string, Map<string, string>>(); // player -> game -> team
  for (const a of finalAppearances) {
    gpByPlayer.set(a.player_id, (gpByPlayer.get(a.player_id) ?? 0) + 1);
    if (!teamByGameByPlayer.has(a.player_id)) {
      teamByGameByPlayer.set(a.player_id, new Map());
    }
    teamByGameByPlayer.get(a.player_id)!.set(a.game_id, a.team_id);
  }

  const seasonGameIds = new Set(finalAppearances.map((a) => a.game_id));

  const skaters: Skater[] = [];
  const goalies: Goalie[] = [];

  for (const [pid, r] of byPlayer) {
    if (!r.player) continue;
    const gp = gpByPlayer.get(pid) ?? 0;
    const teamObj = r.team
      ? { name: r.team.name, slug: r.team.slug, color: r.team.color }
      : undefined;
    const name = `${r.player.first_name} ${r.player.last_name}`;

    if (r.position === "goalie") {
      let ga = 0, ps_faced = 0, ps_saved = 0;
      const myGames = teamByGameByPlayer.get(pid) ?? new Map();
      for (const e of events ?? []) {
        if (!seasonGameIds.has(e.game_id)) continue;
        if (!myGames.has(e.game_id)) continue;
        const myTeam = myGames.get(e.game_id);
        if (e.type === "goal" && e.team_id !== myTeam) ga++;
        else if (e.type === "penalty" && e.team_id === myTeam) {
          ps_faced++;
          if (e.penalty_shot_result === "saved") ps_saved++;
          else if (e.penalty_shot_result === "goal") ga++;
        }
      }
      goalies.push({ id: pid, name, team: teamObj, gp, ga, ps_faced, ps_saved });
    } else {
      let goals = 0, assists = 0, penalties = 0, ps_taken = 0, ps_made = 0;
      for (const e of events ?? []) {
        if (!seasonGameIds.has(e.game_id)) continue;
        if (e.type === "goal") {
          if (e.player_id === pid) goals++;
          if (e.assist1_player_id === pid || e.assist2_player_id === pid) assists++;
        } else if (e.type === "penalty") {
          if (e.player_id === pid) penalties++;
          if (e.penalty_shot_taker_id === pid) {
            ps_taken++;
            if (e.penalty_shot_result === "goal") ps_made++;
          }
        }
      }
      skaters.push({
        id: pid,
        name,
        team: teamObj,
        position: r.position as "forward" | "defense",
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

  const topPoints = [...skaters].sort((a, b) => b.points - a.points || b.goals - a.goals).slice(0, 10);
  const topGoals = [...skaters].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssists = [...skaters].sort((a, b) => b.assists - a.assists).slice(0, 5);
  const mostPenalties = [...skaters].sort((a, b) => b.penalties - a.penalties).slice(0, 5).filter((s) => s.penalties > 0);
  const goaliesRanked = [...goalies].sort((a, b) => {
    // Goalies who have played sort first; then fewest GA per game; then most GP.
    const aPlayed = a.gp > 0 ? 1 : 0;
    const bPlayed = b.gp > 0 ? 1 : 0;
    if (aPlayed !== bPlayed) return bPlayed - aPlayed;
    const aGaPerG = a.gp > 0 ? a.ga / a.gp : Infinity;
    const bGaPerG = b.gp > 0 ? b.ga / b.gp : Infinity;
    return aGaPerG - bGaPerG || b.gp - a.gp;
  });

  return (
    <div className="space-y-12">
      <div className="rise">
        <SectionHeader
          eyebrow="The Numbers"
          title="Stats"
          subtitle={`${season.name} · league leaders`}
          size="lg"
        />
      </div>

      {/* Top points (full table) */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="Skaters" title="Points Leaders" />
        <div className="panel overflow-x-auto">
          <table className="board-table min-w-[680px]">
            <thead>
              <tr>
                <th className="text-left pl-5 w-12">#</th>
                <th className="text-left">Player</th>
                <th className="text-left hidden sm:table-cell">Team</th>
                <th className="text-right">GP</th>
                <th className="text-right">G</th>
                <th className="text-right">A</th>
                <th className="text-right">PEN</th>
                <th className="text-right pr-5">PTS</th>
              </tr>
            </thead>
            <tbody>
              {topPoints.length === 0 ? (
                <tr><td colSpan={8} className="pl-5 py-6 eyebrow">No stats yet</td></tr>
              ) : (
                topPoints.map((s, i) => (
                  <tr key={s.id}>
                    <td className="pl-5 digit text-ink-faint">{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <Link href={`/players/${s.id}`} className="hover:text-ink transition-colors">
                        {s.name}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell">
                      {s.team && <TeamBadge {...s.team} size="sm" />}
                    </td>
                    <td className="text-right tnum text-ink-dim">{s.gp}</td>
                    <td className="text-right tnum text-ink">{s.goals}</td>
                    <td className="text-right tnum text-ink-dim">{s.assists}</td>
                    <td className="text-right tnum text-ink-dim">{s.penalties}</td>
                    <td className="text-right pr-5 digit text-lg text-ink">{s.points}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top goals + assists side by side */}
      <section className="rise delay-2 grid gap-6 md:grid-cols-2">
        <LeaderList title="Goals" eyebrow="Snipers" rows={topGoals.map((s) => ({
          id: s.id, name: s.name, team: s.team, value: s.goals,
        }))} />
        <LeaderList title="Assists" eyebrow="Playmakers" rows={topAssists.map((s) => ({
          id: s.id, name: s.name, team: s.team, value: s.assists,
        }))} />
      </section>

      {/* Penalties */}
      {mostPenalties.length > 0 && (
        <section className="rise delay-3">
          <SectionHeader eyebrow="The Box" title="Most Penalties" />
          <LeaderList
            title=""
            eyebrow=""
            rows={mostPenalties.map((s) => ({
              id: s.id,
              name: s.name,
              team: s.team,
              value: s.penalties,
              valueAccent: "text-goal",
            }))}
            hideHeader
          />
        </section>
      )}

      {/* Goalies */}
      <section className="rise delay-4">
        <SectionHeader eyebrow="Between The Pipes" title="Goalies" />
        <div className="panel overflow-x-auto">
          <table className="board-table min-w-[560px]">
            <thead>
              <tr>
                <th className="text-left pl-5 w-12">#</th>
                <th className="text-left">Goalie</th>
                <th className="text-left hidden sm:table-cell">Team</th>
                <th className="text-right">GP</th>
                <th className="text-right">GA</th>
                <th className="text-right">PSF</th>
                <th className="text-right pr-5">PSV</th>
              </tr>
            </thead>
            <tbody>
              {goaliesRanked.length === 0 ? (
                <tr><td colSpan={7} className="pl-5 py-6 eyebrow">No goalies on file</td></tr>
              ) : (
                goaliesRanked.map((g, i) => (
                  <tr key={g.id}>
                    <td className="pl-5 digit text-ink-faint">{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <Link href={`/players/${g.id}`} className="hover:text-ink transition-colors">
                        {g.name}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell">
                      {g.team && <TeamBadge {...g.team} size="sm" />}
                    </td>
                    <td className="text-right tnum text-ink-dim">{g.gp}</td>
                    <td className="text-right tnum text-ink-dim">{g.ga}</td>
                    <td className="text-right tnum text-ink-dim">{g.ps_faced}</td>
                    <td className="text-right pr-5 digit text-lg text-ink">{g.ps_saved}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="eyebrow mt-3 normal-case tracking-[0.06em]">
          GA includes penalty-shot goals. PSF = penalty shots faced; PSV = penalty shots saved.
        </p>
      </section>
    </div>
  );
}

function LeaderList({
  title,
  eyebrow,
  rows,
  hideHeader,
}: {
  title: string;
  eyebrow: string;
  rows: Array<{
    id: string;
    name: string;
    team?: { name: string; slug: string; color: string };
    value: number;
    valueAccent?: string;
  }>;
  hideHeader?: boolean;
}) {
  return (
    <div>
      {!hideHeader && (
        <div className="goal-line mb-4">
          <div className="eyebrow text-goal">{eyebrow}</div>
          <h3 className="font-display text-[26px] tracking-[0.04em] mt-1">{title.toUpperCase()}</h3>
        </div>
      )}
      <ol className="panel divide-y divide-rule">
        {rows.length === 0 ? (
          <li className="px-5 py-4 eyebrow">No stats yet</li>
        ) : (
          rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="digit text-ink-faint w-7">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1 min-w-0">
                <Link href={`/players/${r.id}`} className="hover:text-ink transition-colors block truncate">
                  {r.name}
                </Link>
                {r.team && (
                  <div className="mt-0.5">
                    <TeamBadge {...r.team} size="sm" />
                  </div>
                )}
              </div>
              <span className={`digit text-2xl ${r.valueAccent ?? "text-ink"}`}>{r.value}</span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
