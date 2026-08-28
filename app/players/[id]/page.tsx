import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { BadgeShelf } from "@/components/BadgeShelf";
import { GameLogSection, type GameLogRow } from "@/components/GameLogSection";
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
  isCurrent: boolean;
};


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
        "season_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved, team:team_id(name, slug, color)",
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
  const finalAppearances = (appearances ?? []).filter((a) => {
    if (a.game?.status !== "final") return false;
    if (a.game?.kind === "playoff") return false;
    const seasonId = a.game?.season_id;
    if (!seasonId) return false;
    const myTeam = myTeamBySeason.get(seasonId);
    return !!myTeam && myTeam === a.team_id;
  });
  const myCurrentGameIds = new Set(finalAppearances.map((a) => a.game_id));
  const myCurrentTeamByGame = new Map(finalAppearances.map((a) => [a.game_id, a.team_id]));

  const currentSeason = (seasons ?? []).find((s) => s.is_current);
  const currentSeasonStats = {
    gp: 0, goals: 0, assists: 0, penalties: 0, ps_taken: 0, ps_made: 0,
    ga: 0, ps_faced: 0, ps_saved: 0,
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
      playoff_round: "sf1" | "sf2" | "final" | null;
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

  if (currentSeason && currentSeasonStats.gp > 0) {
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
      isCurrent: false,
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
    }),
    { gp: 0, goals: 0, assists: 0, points: 0, penalties: 0, ps_taken: 0, ps_made: 0, ga: 0, ps_faced: 0, ps_saved: 0 },
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

  const teamColor = currentRoster?.team?.color ?? "#6b7280";

  const awardList = orderedAwards.map(([type, seasonsList]) => ({
    type,
    label: AWARD_LABELS[type],
    seasons: seasonsList,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/teams" className="rise eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11 -mx-2 px-2">
        ← Teams
      </Link>

      {/* Hero */}
      <section
        className="rise panel p-3 sm:p-4 md:p-5 relative"
        style={{
          background: `linear-gradient(135deg, ${teamColor}1f 0%, transparent 60%), var(--board-2)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: teamColor, boxShadow: `0 0 24px ${teamColor}99` }}
        />
        <div className="flex items-start gap-3 sm:gap-4 md:gap-6">
          <div className="relative h-14 w-14 sm:h-20 sm:w-20 md:h-24 md:w-24 shrink-0 scoreboard flex flex-col items-center justify-center">
            {currentRoster?.jersey_number ? (
              <>
                <div className="eyebrow text-[9px]">No.</div>
                <div className="digit text-[26px] sm:text-[36px] md:text-[44px] leading-none mt-0.5" style={{ color: teamColor, textShadow: `0 0 16px ${teamColor}99` }}>
                  {currentRoster.jersey_number}
                </div>
              </>
            ) : (
              <div className="font-display text-[22px] sm:text-[32px] md:text-[40px]" style={{ color: teamColor }}>
                {initials(player.first_name, player.last_name)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-goal text-[10px]">{isGoalie ? "Goalie" : "Skater"}</div>
            <h1 className="font-display text-[22px] sm:text-[32px] md:text-[48px] leading-[0.95] tracking-[0.04em] mt-0.5">
              <span className="text-ink-dim">{player.first_name.toUpperCase()}</span>{" "}
              {player.last_name.toUpperCase()}
            </h1>
            {currentRoster?.team && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <TeamBadge {...currentRoster.team} size="sm" />
                <span className="eyebrow text-[10px]">{currentRoster.position}</span>
              </div>
            )}
          </div>
        </div>

        {contact && (contact.email || contact.phone) && (
          <div className="mt-3 pt-3 border-t border-rule">
            <div className="eyebrow mb-1.5">Contact <span className="text-ink-faint normal-case tracking-normal">· captain/admin only</span></div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="font-mono text-xs text-ice hover:underline min-h-11 inline-flex items-center">
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="font-mono text-xs text-ice hover:underline min-h-11 inline-flex items-center">
                  {contact.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {awardList.length > 0 && (
          <div className="mt-3 pt-3 border-t border-rule">
            <BadgeShelf awards={awardList} />
          </div>
        )}

        {captainHistory.length > 0 && (
          <div className="mt-3 pt-3 border-t border-rule">
            <div className="eyebrow mb-1.5">Captained</div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {captainHistory.map((row) => (
                <li key={row.season_id} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ background: row.team_color }}
                  />
                  <Link
                    href={`/teams/${row.team_slug}`}
                    className="text-ink hover:text-ice transition-colors"
                  >
                    {row.team_name}
                  </Link>
                  <span className="text-ink-faint">{row.season_name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Career table */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="Career" title={isGoalie ? "Goaltending Record" : "Skater Stats"} />
        {rows.length === 0 ? (
          <div className="panel-bare p-6 stripes">
            <div className="eyebrow mb-2 text-goal">No games yet</div>
            <p className="text-ink-dim text-[14px]">
              This player hasn&apos;t logged any games. Stats will appear here as they take the ice.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards, one per season + an all-time card */}
            <div className="space-y-3 sm:hidden">
              {rows.map((r) => (
                <div key={r.season_id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-ink font-medium">{r.season_name}</span>
                        {r.isCurrent && (
                          <span className="chip chip-final text-[9px] px-1.5 py-0.5">CURRENT</span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        {r.team ? <TeamBadge {...r.team} size="sm" /> : <span className="text-ink-faint text-[13px]">—</span>}
                      </div>
                    </div>
                    {!isGoalie && (
                      <div className="text-right shrink-0">
                        <div className="digit text-2xl text-ink">{r.points}</div>
                        <div className="eyebrow">PTS</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-rule grid grid-cols-3 gap-3 text-[13px]">
                    <CardStat label="GP" value={r.gp} />
                    {isGoalie ? (
                      <>
                        <CardStat label="GA" value={r.ga ?? "—"} />
                        <CardStat label="PSV" value={r.ps_saved ?? "—"} accent="text-ink" />
                        <CardStat label="PSF" value={r.ps_faced ?? "—"} />
                      </>
                    ) : (
                      <>
                        <CardStat label="G" value={r.goals} accent="text-ink" />
                        <CardStat label="A" value={r.assists} />
                        <CardStat label="PEN" value={r.penalties} />
                        <CardStat label="PS" value={r.ps_taken} />
                        <CardStat label="PSG" value={r.ps_made} />
                      </>
                    )}
                  </div>
                </div>
              ))}
              {/* All-time card */}
              <div className="panel p-4 border-t-2 border-rule-strong bg-board-3/30">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-display tracking-[0.14em] text-goal">ALL-TIME</span>
                  {!isGoalie && (
                    <div className="text-right shrink-0">
                      <div className="digit text-2xl text-goal">{totals.points}</div>
                      <div className="eyebrow">PTS</div>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-rule grid grid-cols-3 gap-3 text-[13px]">
                  <CardStat label="GP" value={totals.gp} accent="text-ink" />
                  {isGoalie ? (
                    <>
                      <CardStat label="GA" value={totals.ga} accent="text-ink" />
                      <CardStat label="PSV" value={totals.ps_saved} accent="text-ink" />
                      <CardStat label="PSF" value={totals.ps_faced} accent="text-ink" />
                    </>
                  ) : (
                    <>
                      <CardStat label="G" value={totals.goals} accent="text-ink" />
                      <CardStat label="A" value={totals.assists} accent="text-ink" />
                      <CardStat label="PEN" value={totals.penalties} accent="text-ink" />
                      <CardStat label="PS" value={totals.ps_taken} accent="text-ink" />
                      <CardStat label="PSG" value={totals.ps_made} accent="text-ink" />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="panel hidden sm:block overflow-x-auto">
              <table className="board-table">
                <thead>
                  <tr>
                    <th className="text-left pl-5">Season</th>
                    <th className="text-left">Team</th>
                    <th className="text-right">GP</th>
                    {isGoalie ? (
                      <>
                        <th className="text-right">GA</th>
                        <th className="text-right">PSF</th>
                        <th className="text-right pr-5">PSV</th>
                      </>
                    ) : (
                      <>
                        <th className="text-right">G</th>
                        <th className="text-right">A</th>
                        <th className="text-right">PEN</th>
                        <th className="text-right">PS</th>
                        <th className="text-right">PSG</th>
                        <th className="text-right pr-5">PTS</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.season_id}>
                      <td className="pl-5">
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{r.season_name}</span>
                          {r.isCurrent && (
                            <span className="chip chip-final text-[9px] px-1.5 py-0.5">CURRENT</span>
                          )}
                        </div>
                      </td>
                      <td>{r.team ? <TeamBadge {...r.team} size="sm" /> : <span className="text-ink-faint">—</span>}</td>
                      <td className="text-right tnum text-ink-dim">{r.gp}</td>
                      {isGoalie ? (
                        <>
                          <td className="text-right tnum text-ink-dim">{r.ga ?? "—"}</td>
                          <td className="text-right tnum text-ink-dim">{r.ps_faced ?? "—"}</td>
                          <td className="text-right pr-5 tnum text-ink">{r.ps_saved ?? "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-right tnum text-ink">{r.goals}</td>
                          <td className="text-right tnum text-ink-dim">{r.assists}</td>
                          <td className="text-right tnum text-ink-dim">{r.penalties}</td>
                          <td className="text-right tnum text-ink-dim">{r.ps_taken}</td>
                          <td className="text-right tnum text-ink-dim">{r.ps_made}</td>
                          <td className="text-right pr-5 digit text-lg text-ink">{r.points}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {/* All-time totals */}
                  <tr className="border-t-2 border-rule-strong bg-board-3/30">
                    <td className="pl-5">
                      <span className="font-display tracking-[0.14em] text-goal">ALL-TIME</span>
                    </td>
                    <td><span className="text-ink-faint">—</span></td>
                    <td className="text-right tnum text-ink">{totals.gp}</td>
                    {isGoalie ? (
                      <>
                        <td className="text-right tnum text-ink">{totals.ga}</td>
                        <td className="text-right tnum text-ink">{totals.ps_faced}</td>
                        <td className="text-right pr-5 digit text-lg text-ink">{totals.ps_saved}</td>
                      </>
                    ) : (
                      <>
                        <td className="text-right tnum text-ink">{totals.goals}</td>
                        <td className="text-right tnum text-ink">{totals.assists}</td>
                        <td className="text-right tnum text-ink">{totals.penalties}</td>
                        <td className="text-right tnum text-ink">{totals.ps_taken}</td>
                        <td className="text-right tnum text-ink">{totals.ps_made}</td>
                        <td className="text-right pr-5 digit text-xl text-goal">{totals.points}</td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="eyebrow mt-3 normal-case tracking-[0.06em]">
              {isGoalie
                ? "GA includes penalty-shot goals. PSF = penalty shots faced; PSV = penalty shots saved."
                : "PEN = penalties committed. PS = penalty shots taken; PSG = penalty shots scored."}
            </p>
          </>
        )}
      </section>

      {/* Game log */}
      <section className="rise delay-2">
        <SectionHeader eyebrow="Game Log" title="Recent Games" />
        <GameLogSection rows={gameLog} isGoalie={isGoalie} />
      </section>
    </div>
  );
}

function CardStat({
  label,
  value,
  accent = "text-ink-dim",
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div>
      <div className="eyebrow text-[10px]">{label}</div>
      <div className={`digit text-[18px] tnum mt-0.5 ${accent}`}>{value}</div>
    </div>
  );
}

