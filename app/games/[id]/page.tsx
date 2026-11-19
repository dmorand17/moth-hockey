import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { PlayoffChip } from "@/components/PlayoffChip";
import { TeamBadge, TeamTag } from "@/components/TeamBadge";
import { StatusChip } from "@/components/Chips";
import { CheckInToggle } from "@/components/CheckInToggle";
import { AvailabilityManager, type ManagedPlayer } from "@/components/AvailabilityManager";
import { SubsList, SubsManager, type GameSub } from "@/components/SubsManager";
import { MatchupPanel } from "@/components/MatchupPanel";
import { OddsBoard } from "@/components/OddsBoard";
import { WriteUpCard, type WriteUp } from "@/components/WriteUpCard";
import { GenerateWriteUpButton, WriteUpAdminControls } from "@/components/WriteUpAdminControls";
import { loadPreviewSource, type Db } from "@/lib/write-ups/data";
import type { PreviewSource } from "@/lib/write-ups/prompt";
import { BoxScore } from "@/components/BoxScore";
import { GameTabs } from "@/components/GameTabs";
import { EmptyState } from "@/components/EmptyState";
import { buildBoxScore, resolvePosition, type LineupPlayer, type Position, type TeamBox } from "@/lib/box-score";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBoardViewer, getSessionIfRole } from "@/lib/auth";
import { getGamePosts } from "@/lib/queries";
import { PostThread } from "@/components/PostThread";
import { formatClock, formatDate, formatPeriod, formatTime } from "@/lib/format";

type PlayerRef = { id: string; first_name: string; last_name: string };
type TeamRef = { id: string; name: string; slug: string; color: string };
type AvailPlayer = { id: string; name: string; jersey: number | null };
type TeamAvail = { in: AvailPlayer[]; out: AvailPlayer[]; none: AvailPlayer[] };
type RosterPlayerRow = {
  team_id: string;
  jersey_number: number | null;
  player: PlayerRef | null;
};
type EventRow = {
  id: string;
  period: number;
  clock_seconds: number;
  type: "goal" | "penalty";
  team_id: string;
  penalty_type: string | null;
  penalty_shot_result: "goal" | "saved" | null;
  scorer: PlayerRef | null;
  assist1: PlayerRef | null;
  assist2: PlayerRef | null;
  shooter: PlayerRef | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("games")
    .select("status, home_score, away_score, home_team:home_team_id(name), away_team:away_team_id(name)")
    .eq("id", id)
    .maybeSingle();
  const g = data as unknown as {
    status: string;
    home_score: number;
    away_score: number;
    home_team: { name: string } | null;
    away_team: { name: string } | null;
  } | null;
  if (!g) return { title: "Game" };
  const away = g.away_team?.name ?? "TBD";
  const home = g.home_team?.name ?? "TBD";
  const title =
    g.status === "final" ? `${away} ${g.away_score}, ${home} ${g.home_score}` : `${away} at ${home}`;
  return { title, description: `Scoreboard, box score and play-by-play: ${away} at ${home}.` };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: game } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, location, status, kind, playoff_round, season_id, home_team_id, away_team_id, home_score, away_score, period, clock_seconds, decided_in, shootout_home_goals, shootout_away_goals, home_team:home_team_id(id, name, slug, color), away_team:away_team_id(id, name, slug, color), season:season_id(default_location)",
    )
    .eq("id", id)
    .single();

  if (!game) notFound();

  // Fall back to the season's default rink when the game has no location.
  const seasonRef = game.season as { default_location: string | null } | null;
  const displayLocation = game.location ?? seasonRef?.default_location ?? null;

  const { data: eventsRaw } = await supabase
    .from("game_events")
    .select(
      "id, period, clock_seconds, type, team_id, penalty_type, penalty_shot_result, " +
        "scorer:player_id(id, first_name, last_name), " +
        "assist1:assist1_player_id(id, first_name, last_name), " +
        "assist2:assist2_player_id(id, first_name, last_name), " +
        "shooter:penalty_shot_taker_id(id, first_name, last_name)",
    )
    .eq("game_id", id)
    .order("period")
    .order("clock_seconds", { ascending: false });
  const events = (eventsRaw ?? []) as unknown as EventRow[];

  const homeTeam = game.home_team as unknown as
    | { id: string; name: string; slug: string; color: string }
    | null;
  const awayTeam = game.away_team as unknown as
    | { id: string; name: string; slug: string; color: string }
    | null;
  const tbdTeam = { id: "tbd", name: "TBD", slug: "", color: "#6b7280" };
  const homeView = homeTeam ?? tbdTeam;
  const awayView = awayTeam ?? tbdTeam;

  const viewerIsAdmin = !!(await getSessionIfRole(["admin"]));

  const [gamePosts, boardViewer] = await Promise.all([getGamePosts(id), getBoardViewer()]);

  // Write-ups: RLS already hides hidden rows from everyone but admins.
  // `input` is only selected for admins — non-admins never receive it.
  const writeUpSelect = viewerIsAdmin
    ? "kind, headline, body, model, hidden, edited_at, input"
    : "kind, headline, body, model, hidden, edited_at";
  const { data: writeUpRows } = await supabase
    .from("game_write_ups")
    .select(writeUpSelect)
    .eq("game_id", id);
  const writeUps = (writeUpRows ?? []) as unknown as WriteUp[];
  const previewWriteUp = writeUps.find((w) => w.kind === "preview") ?? null;
  const recapWriteUp = writeUps.find((w) => w.kind === "recap") ?? null;
  const adminSlot = (w: WriteUp) =>
    viewerIsAdmin ? (
      <WriteUpAdminControls
        gameId={id}
        writeUp={w}
        canRegenerate={w.kind === "preview" ? game.status === "scheduled" : game.status === "final"}
      />
    ) : undefined;

  // loadPreviewSource throws on a query error (so the generator never publishes
  // from bad data). On the page, a failed load just means no matchup panel —
  // the rest of the game page must still render.
  let previewSource: PreviewSource | null = null;
  if (game.status === "scheduled" && homeTeam && awayTeam) {
    try {
      previewSource = await loadPreviewSource(supabase as unknown as Db, id);
    } catch (e) {
      console.error("[game page] matchup panel unavailable", e);
    }
  }

  const isFinal = game.status === "final";
  const isLive = game.status === "live";
  const homeWon = isFinal && game.home_score > game.away_score;
  const awayWon = isFinal && game.away_score > game.home_score;

  // Availability — show for any game with two real teams.
  // Interactive controls (check-in, manage) only appear for scheduled games.
  const isScheduled = game.status === "scheduled";
  let availability:
    | {
        home: TeamAvail;
        away: TeamAvail;
        viewerStatus: "in" | "out" | null;
        viewerCanCheckIn: boolean;
        viewerTeamName: string | null;
        manageableTeamIds: string[];
        subsByTeam: Map<string, GameSub[]>;
        addableSubs: { id: string; name: string }[];
      }
    | null = null;

  if (homeTeam && awayTeam) {
    const [{ data: rosterRaw }, { data: availRaw }, { data: userData }, { data: subsRaw }] =
      await Promise.all([
        supabase
          .from("team_players")
          .select("team_id, jersey_number, player:player_id(id, first_name, last_name)")
          .eq("season_id", game.season_id)
          .in("team_id", [homeTeam.id, awayTeam.id]),
        supabase
          .from("game_availability")
          .select("player_id, status")
          .eq("game_id", id),
        supabase.auth.getUser(),
        supabase
          .from("game_subs")
          .select("team_id, position, player:player_id(id, first_name, last_name)")
          .eq("game_id", id),
      ]);

    const roster = (rosterRaw ?? []) as unknown as RosterPlayerRow[];

    const subsByTeam = new Map<string, GameSub[]>();
    for (const row of subsRaw ?? []) {
      const pl = row.player as unknown as { id: string; first_name: string; last_name: string } | null;
      if (!pl) continue;
      const list = subsByTeam.get(row.team_id) ?? [];
      list.push({ id: pl.id, name: `${pl.first_name} ${pl.last_name}`, position: row.position });
      subsByTeam.set(row.team_id, list);
    }
    for (const list of subsByTeam.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const statusBy = new Map<string, "in" | "out">();
    for (const a of availRaw ?? []) {
      statusBy.set(a.player_id, a.status as "in" | "out");
    }

    let viewerPlayerId: string | null = null;
    let manageableTeamIds: string[] = [];

    if (userData.user) {
      const [{ data: me }, { data: roleRow }] = await Promise.all([
        supabase
          .from("players")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
      ]);
      viewerPlayerId = me?.id ?? null;

      if (isScheduled) {
        if (roleRow?.role === "admin") {
          manageableTeamIds = [homeTeam.id, awayTeam.id];
        } else if (roleRow?.role === "team_captain") {
          const { data: captainRow } = await supabase
            .from("team_captains")
            .select("team_id")
            .eq("user_id", userData.user.id)
            .eq("season_id", game.season_id)
            .in("team_id", [homeTeam.id, awayTeam.id])
            .maybeSingle();
          if (captainRow) manageableTeamIds = [captainRow.team_id];
        }
      }
    }

    const byName = (a: AvailPlayer, b: AvailPlayer) => a.name.localeCompare(b.name);
    const bucket = (teamId: string): TeamAvail => {
      const acc: TeamAvail = { in: [], out: [], none: [] };
      for (const r of roster) {
        if (r.team_id !== teamId || !r.player) continue;
        const p: AvailPlayer = {
          id: r.player.id,
          name: `${r.player.first_name} ${r.player.last_name}`,
          jersey: r.jersey_number,
        };
        const s = statusBy.get(r.player.id);
        if (s === "in") acc.in.push(p);
        else if (s === "out") acc.out.push(p);
        else acc.none.push(p);
      }
      acc.in.sort(byName);
      acc.out.sort(byName);
      acc.none.sort(byName);
      return acc;
    };

    const onHome =
      viewerPlayerId != null &&
      roster.some((r) => r.player?.id === viewerPlayerId && r.team_id === homeTeam.id);
    const onAway =
      viewerPlayerId != null &&
      roster.some((r) => r.player?.id === viewerPlayerId && r.team_id === awayTeam.id);

    // Sub search pool, only for viewers who can manage a team: every league
    // player except both teams' rosters (they're already in this game's
    // check-in) and anyone already lined up as a sub.
    let addableSubs: { id: string; name: string }[] = [];
    if (manageableTeamIds.length > 0) {
      const taken = new Set([
        ...roster.map((r) => r.player?.id).filter((x): x is string => !!x),
        ...[...subsByTeam.values()].flat().map((s) => s.id),
      ]);
      const { data: allPlayers } = await supabase
        .from("players")
        .select("id, first_name, last_name")
        .order("last_name");
      addableSubs = (allPlayers ?? [])
        .filter((p) => !taken.has(p.id))
        .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
    }

    availability = {
      home: bucket(homeTeam.id),
      away: bucket(awayTeam.id),
      viewerStatus: viewerPlayerId ? (statusBy.get(viewerPlayerId) ?? null) : null,
      viewerCanCheckIn: onHome || onAway,
      viewerTeamName: onHome ? homeTeam.name : onAway ? awayTeam.name : null,
      manageableTeamIds,
      subsByTeam,
      addableSubs,
    };
  }

  // Box score: who played (the scorekeeper's check-in, i.e. game_appearances)
  // and their stat lines. Positions come from the season roster, overridden by
  // a lined-up sub's chosen position; anyone else defaults to forward.
  let box: { home: TeamBox; away: TeamBox } | null = null;
  let hasLineup = false;
  if ((isLive || isFinal) && homeTeam && awayTeam) {
    const [{ data: appRows }, { data: rosterRows }, { data: subRows }] = await Promise.all([
      supabase
        .from("game_appearances")
        .select("player_id, team_id, is_sub, position, player:player_id(first_name, last_name)")
        .eq("game_id", id),
      supabase
        .from("team_players")
        .select("player_id, position, jersey_number")
        .eq("season_id", game.season_id),
      supabase.from("game_subs").select("player_id, position").eq("game_id", id),
    ]);
    const rosterBy = new Map(
      (rosterRows ?? []).map((r) => [r.player_id, { position: r.position as Position, jersey: r.jersey_number }]),
    );
    const subPosition = new Map((subRows ?? []).map((s) => [s.player_id, s.position as Position]));
    const apps = (appRows ?? []) as unknown as {
      player_id: string;
      team_id: string;
      is_sub: boolean;
      position: Position | null;
      player: { first_name: string; last_name: string } | null;
    }[];
    hasLineup = apps.length > 0;
    const lineup: LineupPlayer[] = apps.map((a) => ({
      playerId: a.player_id,
      name: a.player ? `${a.player.first_name} ${a.player.last_name}` : "Unknown",
      jersey: rosterBy.get(a.player_id)?.jersey ?? null,
      teamId: a.team_id,
      position: resolvePosition(a.position, subPosition.get(a.player_id), rosterBy.get(a.player_id)?.position),
      isSub: a.is_sub,
    }));
    box = buildBoxScore({
      lineup,
      events: events.map((e) => ({
        type: e.type,
        teamId: e.team_id,
        playerId: e.scorer?.id ?? null,
        assist1Id: e.assist1?.id ?? null,
        assist2Id: e.assist2?.id ?? null,
        shotTakerId: e.shooter?.id ?? null,
        shotResult: e.penalty_shot_result,
      })),
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      final: isFinal
        ? {
            homeScore: game.home_score,
            awayScore: game.away_score,
            decidedIn: game.decided_in as "regulation" | "ot" | "shootout" | null,
          }
        : null,
    });
  }

  // Availability sits under the scoreboard for scheduled games (who's in matters
  // most before puck drop) and near the end, collapsed, for live/final games.
  // Discussion always sits directly under Availability.
  const discussionSection = (
    <section className="space-y-4">
      <SectionHeader eyebrow="Locker Room" title="Discussion" />
      <PostThread threads={gamePosts} viewer={boardViewer} gameId={game.id} empty="No posts about this game yet." />
    </section>
  );

  const availabilitySection = availability && (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Roster"
        title="Availability"
        subtitle={isScheduled ? "Who's in for this game" : "Who was in for this game"}
      />
      {isScheduled && availability.viewerCanCheckIn && (
        <div className="panel p-4 space-y-3">
          <p className="text-[14px] text-ink">
            You&apos;re on{" "}
            <span className="font-medium">{availability.viewerTeamName}</span> — are you
            in?
          </p>
          <CheckInToggle gameId={game.id} status={availability.viewerStatus} />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {availability.manageableTeamIds.includes(awayView.id) ? (
          <AvailabilityManager
            gameId={game.id}
            team={awayView}
            players={toManagedPlayers(availability.away)}
          >
            <SubsManager
              gameId={game.id}
              teamId={awayView.id}
              subs={availability.subsByTeam.get(awayView.id) ?? []}
              addableSubs={availability.addableSubs}
            />
          </AvailabilityManager>
        ) : (
          <TeamAvailabilityCard
            team={awayView}
            avail={availability.away}
            subs={availability.subsByTeam.get(awayView.id) ?? []}
          />
        )}
        {availability.manageableTeamIds.includes(homeView.id) ? (
          <AvailabilityManager
            gameId={game.id}
            team={homeView}
            players={toManagedPlayers(availability.home)}
          >
            <SubsManager
              gameId={game.id}
              teamId={homeView.id}
              subs={availability.subsByTeam.get(homeView.id) ?? []}
              addableSubs={availability.addableSubs}
            />
          </AvailabilityManager>
        ) : (
          <TeamAvailabilityCard
            team={homeView}
            avail={availability.home}
            subs={availability.subsByTeam.get(homeView.id) ?? []}
          />
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <Link
        href="/schedule"
        className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11 -mb-4 md:-mb-6"
      >
        <span aria-hidden className="mr-1">←</span> Schedule
      </Link>

      {/* SCOREBOARD */}
      <section className="rise scoreboard overflow-clip">
        <h1 className="sr-only">
          {awayView.name} at {homeView.name}
          {isFinal ? `, final ${game.away_score}–${game.home_score}` : ""}
        </h1>
        <div className="px-4 md:px-6 py-2.5 border-b border-rule flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-[14px] text-ink-dim">
            {formatDate(game.scheduled_at)} · {formatTime(game.scheduled_at)}
            {displayLocation && <> · {displayLocation}</>}
          </p>
          <div className="flex items-center gap-2">
            {game.kind === "playoff" && <PlayoffChip round={game.playoff_round} />}
            <StatusChip
              status={game.status}
              decidedIn={game.decided_in}
              liveDetail={isLive ? `${formatPeriod(game.period)} · ${formatClock(game.clock_seconds)}` : undefined}
            />
          </div>
        </div>

        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
          <TeamColumn team={awayView} label="Away" score={game.away_score} showScore={!isScheduled} won={awayWon} dimmed={isFinal && !awayWon} align="left" />
          <div aria-hidden className="hidden md:block font-display text-[24px] text-ink-faint">
            {isScheduled ? "at" : "–"}
          </div>
          <TeamColumn team={homeView} label="Home" score={game.home_score} showScore={!isScheduled} won={homeWon} dimmed={isFinal && !homeWon} align="right" />
        </div>

        {game.decided_in === "shootout" && (
          <div className="px-4 md:px-6 py-3 border-t border-rule flex items-center justify-between gap-4 text-[14px]">
            <span className="text-ink-dim">
              Shootout <span className="digit text-ink ml-1">{game.shootout_away_goals}</span>
            </span>
            <span className="eyebrow">Final tally</span>
            <span className="text-ink-dim">
              <span className="digit text-ink mr-1">{game.shootout_home_goals}</span> Shootout
            </span>
          </div>
        )}
      </section>

      <GameTabs
        label="Game details"
        tabs={[
          {
            id: "recap",
            label: isScheduled ? "Preview" : "Recap",
            content: (
              <>
                {isScheduled && previewWriteUp && (
                  <WriteUpCard
                    writeUp={previewWriteUp}
                    footer={
                      previewSource?.projection && (
                        <OddsBoard projection={previewSource.projection} awayName={previewSource.away.name} homeName={previewSource.home.name} />
                      )
                    }
                    admin={adminSlot(previewWriteUp)}
                  />
                )}
                {isFinal && recapWriteUp && <WriteUpCard writeUp={recapWriteUp} admin={adminSlot(recapWriteUp)} />}
                {viewerIsAdmin && isScheduled && !previewWriteUp && <GenerateWriteUpButton gameId={id} kind="preview" />}
                {viewerIsAdmin && isFinal && !recapWriteUp && <GenerateWriteUpButton gameId={id} kind="recap" />}
                {!(isScheduled ? previewWriteUp : isFinal ? recapWriteUp : null) && (
                  <EmptyState title={isScheduled ? "No preview yet." : isLive ? "Game in progress." : "No recap for this game yet."}>
                    {isScheduled ? "Check the matchup below." : "The box score and play-by-play have the details."}
                  </EmptyState>
                )}
                {previewSource && (
                  <section className="space-y-4">
                    <SectionHeader eyebrow="Preview" title="Matchup" />
                    <MatchupPanel source={previewSource} />
                  </section>
                )}
                {isScheduled && availabilitySection}
              </>
            ),
          },
          {
            id: "box-score",
            label: "Box Score",
            content: (
              <>
                {(isLive || isFinal) && box && hasLineup ? (
                  <BoxScore box={box} home={homeView} away={awayView} />
                ) : (
                  <EmptyState title={isScheduled ? "The box score appears once the game starts." : "No lineup recorded for this game."} />
                )}
                {!isScheduled && availabilitySection}
              </>
            ),
          },
          {
            id: "play-by-play",
            label: "Play-by-Play",
            content: (
              <>
        {events.length === 0 ? (
          <p className="text-[14px] text-ink-faint">No events recorded.</p>
        ) : (
          <ol className="panel overflow-clip">
            {groupByPeriod(events).map(({ period, items }) => (
              <li key={period}>
                <h3 className="px-4 py-1.5 bg-board-3 border-b border-rule eyebrow">{periodName(period)}</h3>
                <ol className="divide-y divide-rule">
                  {items.map((e) => {
                    const team = e.team_id === homeView.id ? homeView : awayView;
                    const isGoal = e.type === "goal";
                    return (
                      <li key={e.id} className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-x-3 px-4 py-2">
                        <span className="digit text-[15px] text-ink-dim">{formatClock(e.clock_seconds)}</span>
                        <div className="min-w-0">
                          <p className="text-[16px] leading-6">
                            <span className={`mr-2 text-[12px] font-bold uppercase tracking-[0.06em] ${isGoal ? "text-goal" : "text-ink-dim"}`}>
                              {isGoal ? "Goal" : "Penalty"}
                            </span>
                            {e.scorer && (
                              <Link href={`/players/${e.scorer.id}`} className="font-semibold text-ink hover:text-ice transition-colors">
                                {e.scorer.first_name} {e.scorer.last_name}
                              </Link>
                            )}
                            {!isGoal && e.penalty_type && <span className="text-[14px] text-ink-dim"> · {e.penalty_type}</span>}
                          </p>
                          {isGoal && (e.assist1 || e.assist2) && (
                            <p className="text-[14px] leading-5 text-ink-faint">
                              Assists:{" "}
                              {[e.assist1, e.assist2]
                                .filter(Boolean)
                                .map((a) => `${a!.first_name} ${a!.last_name}`)
                                .join(", ")}
                            </p>
                          )}
                          {!isGoal && e.shooter && (
                            <p className="text-[14px] leading-5 text-ink-faint">
                              Penalty shot:{" "}
                              <Link href={`/players/${e.shooter.id}`} className="text-ink-dim hover:text-ice transition-colors">
                                {e.shooter.first_name} {e.shooter.last_name}
                              </Link>{" "}
                              —{" "}
                              <span className={`font-semibold ${e.penalty_shot_result === "goal" ? "text-goal" : "text-ink-dim"}`}>
                                {e.penalty_shot_result === "goal" ? "Goal" : "Saved"}
                              </span>
                            </p>
                          )}
                        </div>
                        <span className="sm:hidden">
                          <TeamTag name={team.name} color={team.color} />
                        </span>
                        <span className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
                          <span aria-hidden className="swatch h-2 w-2 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        )}
              </>
            ),
          },
          { id: "discussion", label: "Discussion", content: discussionSection },
        ]}
      />
    </div>
  );
}

function toManagedPlayers(avail: TeamAvail): ManagedPlayer[] {
  return [
    ...avail.in.map((p) => ({ ...p, status: "in" as const })),
    ...avail.out.map((p) => ({ ...p, status: "out" as const })),
    ...avail.none.map((p) => ({ ...p, status: null })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

function TeamAvailabilityCard({
  team,
  avail,
  subs,
}: {
  team: TeamRef;
  avail: TeamAvail;
  subs: GameSub[];
}) {
  return (
    <div
      className="panel p-4 space-y-3"
      style={{ borderLeftColor: team.color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
    >
      <div className="flex items-center justify-between gap-2">
        <TeamBadge name={team.name} slug={team.slug} color={team.color} size="sm" />
        <span className="text-[13px] text-ink-faint">
          {avail.in.length} in · {avail.out.length} out
        </span>
      </div>
      <AvailGroup label="In" color="text-win!" players={avail.in} />
      <AvailGroup label="Out" color="text-loss!" players={avail.out} />
      <AvailGroup label="No response" color="text-ink-faint!" players={avail.none} />
      <SubsList subs={subs} />
      {avail.in.length + avail.out.length + avail.none.length === 0 && (
        <p className="text-ink-faint text-[13px]">No roster set for this season.</p>
      )}
    </div>
  );
}

function AvailGroup({
  label,
  color,
  players,
}: {
  label: string;
  color: string;
  players: AvailPlayer[];
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <div className={`eyebrow ${color}`}>
        {label} · {players.length}
      </div>
      <ul className="mt-1 space-y-0.5">
        {players.map((p) => (
          <li key={p.id} className="text-[14px] text-ink-dim">
            <Link href={`/players/${p.id}`} className="inline-flex items-center min-h-[32px] hover:text-ink transition-colors">
              {p.name}
              {p.jersey != null ? ` · #${p.jersey}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamColumn({
  team,
  label,
  score,
  showScore,
  won,
  dimmed,
  align,
}: {
  team: { name: string; slug: string; color: string };
  label: string;
  score: number;
  showScore: boolean;
  won: boolean;
  dimmed: boolean;
  align: "left" | "right";
}) {
  // Mobile: one row per team (name left, score right). md+: away mirrors home
  // so both scores sit next to the center divider.
  const mirror = align === "right" ? "md:flex-row-reverse md:text-right" : "";
  return (
    <div className={`flex items-center gap-4 ${mirror}`}>
      <span aria-hidden className="swatch w-1 self-stretch rounded-[1px] shrink-0" style={{ background: team.color }} />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-2 ${align === "right" ? "md:justify-end" : ""}`}>
          <span className="eyebrow">{label}</span>
          {won && <span className="chip chip-win">Win</span>}
        </div>
        <Link
          href={`/teams/${team.slug}`}
          className={`block font-display text-[28px] leading-8 md:text-[36px] md:leading-10 tracking-[0.02em] hover:text-ice transition-colors ${
            dimmed ? "text-ink-dim" : "text-ink"
          }`}
        >
          {team.name}
        </Link>
      </div>
      {showScore && (
        <span className={`digit text-[44px] md:text-[64px] leading-none shrink-0 ${dimmed ? "text-ink-faint" : "text-ink"}`}>
          {score}
        </span>
      )}
    </div>
  );
}

const PERIOD_NAME: Record<string, string> = {
  P1: "1st period",
  P2: "2nd period",
  P3: "3rd period",
  OT: "Overtime",
  SO: "Shootout",
};

function periodName(period: number): string {
  const short = formatPeriod(period);
  return PERIOD_NAME[short] ?? short;
}

// Consecutive events grouped by period, preserving order.
function groupByPeriod(events: EventRow[]): { period: number; items: EventRow[] }[] {
  const groups: { period: number; items: EventRow[] }[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last.period === e.period) last.items.push(e);
    else groups.push({ period: e.period, items: [e] });
  }
  return groups;
}
