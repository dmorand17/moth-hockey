import Link from "next/link";
import { DataTable } from "@/components/DataTable";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { BadgeShelf } from "@/components/BadgeShelf";
import { GameLogSection, type GameLogRow } from "@/components/GameLogSection";
import { TeamTag } from "@/components/TeamBadge";
import { EmptyState } from "@/components/EmptyState";
import { Disclosure } from "@/components/Disclosure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { initials } from "@/lib/format";
import { getSessionIfRole } from "@/lib/auth";
import { AWARD_LABELS, AWARD_ORDER } from "@/lib/awards";

type SeasonStatsRow = {
  season_id: string;
  season_name: string;
  season_type: "spring" | "summer" | "fall" | "winter";
  year: number;
  position: "forward" | "defense" | "goalie";
  team?: { name: string; slug: string; color: string };
  gp: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ps_taken: number;
  ps_made: number;
  ga: number | null;
  ps_faced: number | null;
  ps_saved: number | null;
  // Goalie record — only tracked for live seasons; null for imported history.
  w: number | null;
  l: number | null;
  otl: number | null;
  isCurrent: boolean;
};


export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: player } = await supabase.from("players").select("first_name, last_name").eq("id", id).maybeSingle();
  if (!player) return { title: "Player" };
  const name = `${player.first_name} ${player.last_name}`;
  return { title: name, description: `${name}: career stats and game log in the M.O.T.H hockey league.` };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name, user_id")
    .eq("id", id)
    .single();
  if (!player) notFound();

  // Reveal contact info only to admins / team captains. RLS already prevents
  // non-privileged viewers from selecting user_profiles, but we skip the query
  // entirely when the viewer doesn't qualify so we never even ask.
  const privileged = await getSessionIfRole(["admin", "team_captain"]);
  let contact: { email: string | null; phone: string | null } | null = null;
  if (privileged && player.user_id) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email, phone")
      .eq("user_id", player.user_id)
      .single();
    if (profile) contact = { email: profile.email, phone: profile.phone };
  }

  // Captain history — anyone can read team_captains (public RLS), but we only
  // have a user link when this player has been associated with an auth user.
  type CaptainHistoryRow = {
    season_id: string;
    season_name: string;
    season_year: number;
    team_name: string;
    team_slug: string;
    team_color: string;
  };
  let captainHistory: CaptainHistoryRow[] = [];
  if (player.user_id) {
    const { data: tcRows } = await supabase
      .from("team_captains")
      .select(
        "team:team_id(name, slug, color), season:season_id(id, name, year)",
      )
      .eq("user_id", player.user_id);
    captainHistory = (tcRows ?? [])
      .map((row) => {
        const team = row.team as unknown as { name: string; slug: string; color: string } | null;
        const season = row.season as unknown as { id: string; name: string; year: number } | null;
        if (!team || !season) return null;
        return {
          season_id: season.id,
          season_name: season.name,
          season_year: season.year,
          team_name: team.name,
          team_slug: team.slug,
          team_color: team.color,
        };
      })
      .filter((r): r is CaptainHistoryRow => r !== null)
      .sort((a, b) => b.season_year - a.season_year);
  }

  const [
    { data: rosterRows },
    { data: appearances },
    { data: events },
    { data: historyRows },
    { data: seasons },
    { data: awards },
  ] = await Promise.all([
    supabase
      .from("team_players")
      .select("position, jersey_number, team:team_id(id, name, slug, color), season:season_id(id, name, season_type, year, is_current)")
      .eq("player_id", id),
    supabase
      .from("game_appearances")
      .select("game_id, team_id, is_sub, game:game_id(id, season_id, scheduled_at, status, kind, playoff_round, home_score, away_score, decided_in, home_team:home_team_id(id, name, slug, color), away_team:away_team_id(id, name, slug, color))")
      .eq("player_id", id),
    supabase
      .from("game_events")
      .select(
        "type, team_id, player_id, assist1_player_id, assist2_player_id, penalty_type, penalty_shot_result, penalty_shot_taker_id, game_id",
      ),
    supabase
      .from("season_player_stats")
      .select(
        "season_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved, wins, losses, ot_losses, team:team_id(name, slug, color)",
      )
      .eq("player_id", id),
    supabase
      .from("seasons")
      .select("id, name, season_type, year, is_current"),
    supabase
      .from("player_awards")
      .select("award_type, season:season_id(name, year, season_type)")
      .eq("player_id", id),
  ]);

  const currentRoster = (rosterRows ?? []).find((r) => r.season?.is_current);
  const isGoalie = currentRoster?.position === "goalie";

  // Per-season "this player's own team" map. Used to drop sub-for-other-team
  // appearances from season stats — those events still appear in the boxscore
  // but don't count toward this player's totals (see Phase 2 backlog).
  const myTeamBySeason = new Map<string, string>();
  for (const r of rosterRows ?? []) {
    if (r.season?.id && r.team?.id) myTeamBySeason.set(r.season.id, r.team.id);
  }

  // ----- Build current-season stats from live events -----
  // Regular-season only — playoff games appear in the game log but don't
  // roll into season totals (mirrors hockey convention and the standings
  // filter in lib/queries.ts).
  // Only the current season's games: past seasons come from their saved totals.
  const currentSeason = (seasons ?? []).find((s) => s.is_current);
  const finalAppearances = (appearances ?? []).filter((a) => {
    if (a.game?.status !== "final") return false;
    if (a.game?.kind === "playoff") return false;
    const seasonId = a.game?.season_id;
    if (!seasonId || seasonId !== currentSeason?.id) return false;
    const myTeam = myTeamBySeason.get(seasonId);
    return !!myTeam && myTeam === a.team_id;
  });
  const myCurrentGameIds = new Set(finalAppearances.map((a) => a.game_id));
  const myCurrentTeamByGame = new Map(finalAppearances.map((a) => [a.game_id, a.team_id]));

  const currentSeasonStats = {
    gp: 0, goals: 0, assists: 0, penalties: 0, ps_taken: 0, ps_made: 0,
    ga: 0, ps_faced: 0, ps_saved: 0, w: 0, l: 0, otl: 0,
  };
  if (currentSeason) {
    currentSeasonStats.gp = finalAppearances.length;
    for (const e of events ?? []) {
      if (!myCurrentGameIds.has(e.game_id)) continue;
      if (e.type === "goal") {
        if (e.player_id === id) currentSeasonStats.goals++;
        if (e.assist1_player_id === id || e.assist2_player_id === id) currentSeasonStats.assists++;
      } else if (e.type === "penalty") {
        if (e.player_id === id) currentSeasonStats.penalties++;
        if (e.penalty_shot_taker_id === id) {
          currentSeasonStats.ps_taken++;
          if (e.penalty_shot_result === "goal") currentSeasonStats.ps_made++;
        }
      }
    }
    if (isGoalie) {
      for (const a of finalAppearances) {
        const myTeam = myCurrentTeamByGame.get(a.game_id);
        const g = a.game as unknown as {
          home_score: number; away_score: number; decided_in: string | null;
          home_team: { id: string } | null;
        };
        const isHome = g.home_team?.id === myTeam;
        const myScore = isHome ? g.home_score : g.away_score;
        const oppScore = isHome ? g.away_score : g.home_score;
        if (myScore > oppScore) currentSeasonStats.w++;
        else if (g.decided_in === "ot" || g.decided_in === "shootout") currentSeasonStats.otl++;
        else currentSeasonStats.l++;
        for (const e of events ?? []) {
          if (e.game_id !== a.game_id) continue;
          if (e.type === "goal" && e.team_id !== myTeam) currentSeasonStats.ga++;
          else if (e.type === "penalty" && e.team_id === myTeam) {
            currentSeasonStats.ps_faced++;
            if (e.penalty_shot_result === "saved") currentSeasonStats.ps_saved++;
            else if (e.penalty_shot_result === "goal") currentSeasonStats.ga++;
          }
        }
      }
    }
  }

  // ----- Build game log -----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsByGame = new Map<string, any[]>();
  for (const e of events ?? []) {
    const list = eventsByGame.get(e.game_id) ?? [];
    list.push(e);
    eventsByGame.set(e.game_id, list);
  }

  const gameLog: GameLogRow[] = [];
  for (const app of appearances ?? []) {
    const g = app.game as unknown as {
      id: string; season_id: string; scheduled_at: string; status: string;
      kind: "regular" | "playoff";
      playoff_round: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
      home_score: number; away_score: number; decided_in: string | null;
      home_team: { id: string; name: string; slug: string; color: string } | null;
      away_team: { id: string; name: string; slug: string; color: string } | null;
    } | null;
    if (!g || g.status !== "final") continue;
    // Game log shows TBD-resolved games only; stubs without teams can't appear in a player log anyway.
    if (!g.home_team || !g.away_team) continue;

    const isHome = g.home_team.id === app.team_id;
    const opponent = isHome ? g.away_team : g.home_team;
    const myScore = isHome ? g.home_score : g.away_score;
    const oppScore = isHome ? g.away_score : g.home_score;

    const result: "W" | "L" | "OTL" =
      myScore > oppScore ? "W"
      : g.decided_in === "ot" || g.decided_in === "shootout" ? "OTL"
      : "L";

    let goals = 0, assists = 0, penalties = 0, psTaken = 0;
    let ga = 0, psFaced = 0, psSaved = 0;
    for (const e of eventsByGame.get(app.game_id) ?? []) {
      if (e.type === "goal") {
        if (e.player_id === id) goals++;
        if (e.assist1_player_id === id || e.assist2_player_id === id) assists++;
        if (isGoalie && e.team_id !== app.team_id) ga++;
      } else if (e.type === "penalty") {
        if (e.player_id === id) penalties++;
        if (e.penalty_shot_taker_id === id) psTaken++;
        if (isGoalie && e.team_id === app.team_id) {
          psFaced++;
          if (e.penalty_shot_result === "saved") psSaved++;
          else if (e.penalty_shot_result === "goal") ga++;
        }
      }
    }

    gameLog.push({
      game_id: app.game_id,
      scheduled_at: g.scheduled_at,
      opponent,
      home_score: g.home_score,
      away_score: g.away_score,
      is_home: isHome,
      decided_in: g.decided_in as "regulation" | "ot" | "shootout" | null,
      result,
      is_sub: !!app.is_sub,
      goals, assists, points: goals + assists, penalties, ps_taken: psTaken,
      ga, ps_faced: psFaced, ps_saved: psSaved,
      kind: g.kind,
      playoff_round: g.playoff_round,
    });
  }
  gameLog.sort((a, b) =>
    new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );

  // ----- Build per-season rows: current (live) + historical (imported) -----
  const seasonById = new Map((seasons ?? []).map((s) => [s.id, s]));
  const rosterByseason = new Map(
    (rosterRows ?? []).filter((r) => r.season).map((r) => [r.season!.id, r]),
  );
  const rows: SeasonStatsRow[] = [];

  // A finalized current season already has a saved row below — don't count it twice.
  const currentSaved = (historyRows ?? []).some((h) => h.season_id === currentSeason?.id);
  if (currentSeason && currentSeasonStats.gp > 0 && !currentSaved) {
    const r = rosterByseason.get(currentSeason.id);
    rows.push({
      season_id: currentSeason.id,
      season_name: currentSeason.name,
      season_type: currentSeason.season_type,
      year: currentSeason.year,
      position: (r?.position ?? "forward") as "forward" | "defense" | "goalie",
      team: r?.team ? { name: r.team.name, slug: r.team.slug, color: r.team.color } : undefined,
      gp: currentSeasonStats.gp,
      goals: currentSeasonStats.goals,
      assists: currentSeasonStats.assists,
      points: currentSeasonStats.goals + currentSeasonStats.assists,
      penalties: currentSeasonStats.penalties,
      ps_taken: currentSeasonStats.ps_taken,
      ps_made: currentSeasonStats.ps_made,
      ga: isGoalie ? currentSeasonStats.ga : null,
      ps_faced: isGoalie ? currentSeasonStats.ps_faced : null,
      ps_saved: isGoalie ? currentSeasonStats.ps_saved : null,
      w: isGoalie ? currentSeasonStats.w : null,
      l: isGoalie ? currentSeasonStats.l : null,
      otl: isGoalie ? currentSeasonStats.otl : null,
      isCurrent: true,
    });
  }

  for (const h of historyRows ?? []) {
    const s = seasonById.get(h.season_id);
    if (!s) continue;
    rows.push({
      season_id: h.season_id,
      season_name: s.name,
      season_type: s.season_type,
      year: s.year,
      position: h.position as "forward" | "defense" | "goalie",
      team: h.team ? { name: h.team.name, slug: h.team.slug, color: h.team.color } : undefined,
      gp: h.games_played,
      goals: h.goals,
      assists: h.assists,
      points: h.goals + h.assists,
      penalties: h.penalties,
      ps_taken: h.penalty_shots_taken,
      ps_made: h.penalty_shots_made,
      ga: h.goals_against,
      ps_faced: h.penalty_shots_faced,
      ps_saved: h.penalty_shots_saved,
      w: h.wins,
      l: h.losses,
      otl: h.ot_losses,
      isCurrent: s.is_current,
    });
  }

  // Sort newest → oldest
  const SEASON_ORDER: Record<string, number> = { winter: 3, fall: 2, spring: 1 };
  rows.sort((a, b) => b.year - a.year || (SEASON_ORDER[b.season_type] - SEASON_ORDER[a.season_type]));

  // All-time totals
  const totals = rows.reduce(
    (acc, r) => ({
      gp: acc.gp + r.gp,
      goals: acc.goals + r.goals,
      assists: acc.assists + r.assists,
      points: acc.points + r.points,
      penalties: acc.penalties + r.penalties,
      ps_taken: acc.ps_taken + r.ps_taken,
      ps_made: acc.ps_made + r.ps_made,
      ga: acc.ga + (r.ga ?? 0),
      ps_faced: acc.ps_faced + (r.ps_faced ?? 0),
      ps_saved: acc.ps_saved + (r.ps_saved ?? 0),
      w: acc.w + (r.w ?? 0),
      l: acc.l + (r.l ?? 0),
      otl: acc.otl + (r.otl ?? 0),
    }),
    { gp: 0, goals: 0, assists: 0, points: 0, penalties: 0, ps_taken: 0, ps_made: 0, ga: 0, ps_faced: 0, ps_saved: 0, w: 0, l: 0, otl: 0 },
  );

  // Awards: group by type with the season names where each was earned
  const awardSeasons: Record<string, string[]> = {};
  for (const a of awards ?? []) {
    if (!AWARD_LABELS[a.award_type]) continue; // hide unknown types
    const seasonName = a.season?.name ?? "Unknown season";
    (awardSeasons[a.award_type] ||= []).push(seasonName);
  }
  // Sort each badge's season list newest-first by year if we have it
  for (const k of Object.keys(awardSeasons)) {
    awardSeasons[k].sort().reverse();
  }
  const orderedAwards = Object.entries(awardSeasons).sort(
    (a, b) => (AWARD_ORDER.indexOf(a[0]) - AWARD_ORDER.indexOf(b[0])),
  );

  const teamColor = currentRoster?.team?.color ?? "var(--rule-strong)";

  const awardList = orderedAwards.map(([type, seasonsList]) => ({
    type,
    label: AWARD_LABELS[type],
    seasons: seasonsList,
  }));

  // Career columns: key stats first, secondary (dimmed) after.
  const statCols: { label: string; title: string; get: (r: StatLine) => number | string | null; key?: boolean; dim?: boolean }[] = isGoalie
    ? [
        { label: "GP", title: "Games played", get: (r) => r.gp },
        { label: "W", title: "Wins", get: (r) => r.w },
        { label: "L", title: "Losses", get: (r) => r.l },
        { label: "OTL", title: "Overtime/shootout losses", get: (r) => r.otl },
        { label: "GA", title: "Goals against", get: (r) => r.ga },
        { label: "PSV", title: "Penalty shots saved", get: (r) => r.ps_saved, key: true },
        { label: "PSF", title: "Penalty shots faced", get: (r) => r.ps_faced, dim: true },
      ]
    : [
        { label: "GP", title: "Games played", get: (r) => r.gp },
        { label: "G", title: "Goals", get: (r) => r.goals },
        { label: "A", title: "Assists", get: (r) => r.assists },
        { label: "PTS", title: "Points", get: (r) => r.points, key: true },
        { label: "PEN", title: "Penalties committed", get: (r) => r.penalties, dim: true },
        { label: "PS", title: "Penalty shots taken", get: (r) => r.ps_taken, dim: true },
        { label: "PSG", title: "Penalty-shot goals", get: (r) => r.ps_made, dim: true },
      ];

  return (
    <div className="space-y-8 md:space-y-12">
      {/* Hero */}
      <section className="rise">
        <Link
          href="/teams"
          className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11"
        >
          <span aria-hidden className="mr-1">←</span> Teams
        </Link>
        <div className="mt-2 panel overflow-clip flex">
          <span aria-hidden className="swatch w-1 shrink-0" style={{ background: teamColor }} />
          <div className="flex-1 min-w-0 p-4 md:p-6">
            <div className="flex items-center gap-4">
              <div
                className="h-14 w-14 md:h-20 md:w-20 shrink-0 rounded-md border border-rule-strong bg-board-3 flex flex-col items-center justify-center"
                aria-hidden={!currentRoster?.jersey_number}
              >
                {currentRoster?.jersey_number ? (
                  <>
                    <span className="text-[12px] font-semibold text-ink-faint leading-none">No.</span>
                    <span className="digit text-[26px] md:text-[36px] leading-none mt-0.5 text-ink">
                      {currentRoster.jersey_number}
                    </span>
                  </>
                ) : (
                  <span className="font-display text-[24px] md:text-[32px] text-ink-dim">
                    {initials(player.first_name, player.last_name)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{isGoalie ? "Goalie" : "Skater"}</p>
                <h1 className="font-display text-[40px] leading-[44px] md:text-[56px] md:leading-[64px] tracking-[0.02em] break-words">
                  {player.first_name} {player.last_name}
                </h1>
                {currentRoster?.team && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <TeamBadge {...currentRoster.team} size="sm" />
                    <span className="text-[14px] text-ink-faint capitalize">{currentRoster.position}</span>
                  </div>
                )}
              </div>
            </div>

            {contact && (contact.email || contact.phone) && (
              <div className="mt-4 pt-3 border-t border-rule">
                <p className="eyebrow">
                  Contact <span className="normal-case tracking-normal font-normal text-ink-faint">· captain/admin only</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-4">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-[14px] text-ice hover:underline min-h-11 inline-flex items-center">
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="text-[14px] text-ice hover:underline min-h-11 inline-flex items-center">
                      {contact.phone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {awardList.length > 0 && (
              <div className="mt-4 pt-3 border-t border-rule">
                <BadgeShelf awards={awardList} />
              </div>
            )}

            {captainHistory.length > 0 && (
              <div className="mt-4 pt-3 border-t border-rule">
                <p className="eyebrow mb-1">Captained</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                  {captainHistory.map((row) => (
                    <li key={row.season_id} className="flex items-center gap-2">
                      <span aria-hidden className="swatch h-2 w-2 rounded-full shrink-0" style={{ background: row.team_color }} />
                      <Link href={`/teams/${row.team_slug}`} className="text-ink hover:text-ice transition-colors min-h-11 inline-flex items-center">
                        {row.team_name}
                      </Link>
                      <span className="text-ink-faint">{row.season_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Career table */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="Career" title={isGoalie ? "Goaltending record" : "Skater stats"} />
        {rows.length === 0 ? (
          <EmptyState title="No games yet">
            This player hasn&apos;t logged any games. Stats will appear here as they take the ice.
          </EmptyState>
        ) : (
          <>
            <DataTable caption="Career stats by season" scroll dense={false}>
                  <thead>
                    <tr>
                      <th scope="col" className="text-left pl-4">Season</th>
                      <th scope="col" className="text-left hidden sm:table-cell">Team</th>
                      {statCols.map((c) => (
                        <th key={c.label} scope="col" title={c.title} className={`text-right w-12 sm:w-14 ${c.dim ? "col-dim" : ""}`}>
                          {c.label}
                        </th>
                      ))}
                      <th aria-hidden className="w-2 sm:w-3 p-0!" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.season_id}>
                        <th scope="row" className="text-left pl-4 py-2 font-normal">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-ink whitespace-nowrap">{r.season_name}</span>
                            {r.isCurrent && <span className="chip chip-live">Current</span>}
                          </span>
                          {r.team && (
                            <span className="sm:hidden mt-0.5 flex">
                              <TeamTag name={r.team.name} color={r.team.color} />
                            </span>
                          )}
                        </th>
                        <td className="hidden sm:table-cell">
                          {r.team ? <TeamBadge {...r.team} size="sm" /> : <span className="text-ink-faint">—</span>}
                        </td>
                        {statCols.map((c) => (
                          <td
                            key={c.label}
                            className={`text-right ${c.dim ? "col-dim" : c.key ? "font-bold text-ink" : "text-ink-dim"}`}
                          >
                            {c.get(r) ?? "—"}
                          </td>
                        ))}
                        <td aria-hidden className="p-0!" />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-rule-strong">
                      <th scope="row" className="text-left pl-4 py-2.5 border-t border-rule-strong bg-board-3">
                        <span className="text-[14px] font-bold text-ink">All-time</span>
                      </th>
                      <td className="hidden sm:table-cell border-t border-rule-strong bg-board-3" />
                      {statCols.map((c) => (
                        <td
                          key={c.label}
                          className={`text-right px-2 py-2.5 tnum border-t border-rule-strong bg-board-3 ${
                            c.dim ? "text-ink-faint" : c.key ? "font-bold text-goal" : "text-ink font-semibold"
                          }`}
                        >
                          {c.get(totals) ?? "—"}
                        </td>
                      ))}
                      <td aria-hidden className="p-0! border-t border-rule-strong bg-board-3" />
                    </tr>
                  </tfoot>
            </DataTable>
            <Disclosure label="Legend" className="mt-2">
              {isGoalie
                ? "W-L-OTL is tracked for live seasons only (— for imported seasons). GA includes penalty-shot goals. PSF = penalty shots faced; PSV = penalty shots saved."
                : "PEN = penalties committed. PS = penalty shots taken; PSG = penalty shots scored."}
            </Disclosure>
          </>
        )}
      </section>

      {/* Game log */}
      <section className="rise delay-2">
        <SectionHeader eyebrow="Game log" title="Recent games" />
        <GameLogSection rows={gameLog} isGoalie={isGoalie} />
      </section>
    </div>
  );
}

type StatLine = Pick<
  SeasonStatsRow,
  "gp" | "goals" | "assists" | "points" | "penalties" | "ps_taken" | "ps_made" | "ga" | "ps_faced" | "ps_saved" | "w" | "l" | "otl"
>;
