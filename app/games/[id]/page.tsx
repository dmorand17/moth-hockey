import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { PlayoffChip } from "@/components/PlayoffChip";
import { TeamBadge } from "@/components/TeamBadge";
import { CheckInToggle } from "@/components/CheckInToggle";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
      "id, scheduled_at, location, status, kind, playoff_round, season_id, home_team_id, away_team_id, home_score, away_score, period, clock_seconds, decided_in, shootout_home_goals, shootout_away_goals, home_team:home_team_id(id, name, slug, color), away_team:away_team_id(id, name, slug, color)",
    )
    .eq("id", id)
    .single();

  if (!game) notFound();

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
  const isFinal = game.status === "final";
  const isLive = game.status === "live";
  const homeWon = isFinal && game.home_score > game.away_score;
  const awayWon = isFinal && game.away_score > game.home_score;

  // Availability / check-in — scheduled games with two real teams only.
  const isScheduled = game.status === "scheduled";
  let availability:
    | {
        home: TeamAvail;
        away: TeamAvail;
        viewerStatus: "in" | "out" | null;
        viewerCanCheckIn: boolean;
        viewerTeamName: string | null;
      }
    | null = null;

  if (isScheduled && homeTeam && awayTeam) {
    const [{ data: rosterRaw }, { data: availRaw }, { data: userData }] =
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
      ]);

    const roster = (rosterRaw ?? []) as unknown as RosterPlayerRow[];
    const statusBy = new Map<string, "in" | "out">();
    for (const a of availRaw ?? []) {
      statusBy.set(a.player_id, a.status as "in" | "out");
    }

    let viewerPlayerId: string | null = null;
    if (userData.user) {
      const { data: me } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      viewerPlayerId = me?.id ?? null;
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

    availability = {
      home: bucket(homeTeam.id),
      away: bucket(awayTeam.id),
      viewerStatus: viewerPlayerId ? (statusBy.get(viewerPlayerId) ?? null) : null,
      viewerCanCheckIn: onHome || onAway,
      viewerTeamName: onHome ? homeTeam.name : onAway ? awayTeam.name : null,
    };
  }

  return (
    <div className="space-y-5 sm:space-y-8">
      <Link href="/schedule" className="rise eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11 -mx-2 px-2">
        ← Schedule
      </Link>

      {/* SCOREBOARD */}
      <section className="rise scoreboard p-4 sm:p-5 md:p-6 relative overflow-hidden">
        <div className="absolute inset-0 stripes opacity-40 pointer-events-none" />
        <div className="relative">
          {/* Status row */}
          <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
            <div className="eyebrow flex items-center gap-2 flex-wrap">
              <span>{formatDate(game.scheduled_at)}</span>
              <span className="text-rule-strong">·</span>
              <span>{formatTime(game.scheduled_at)}</span>
              {game.location && (
                <>
                  <span className="text-rule-strong">·</span>
                  <span>{game.location}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {game.kind === "playoff" && (
                <PlayoffChip round={game.playoff_round} />
              )}
              {isLive ? (
                <span className="chip chip-live">
                  <span className="live-dot" /> LIVE · {formatPeriod(game.period)} · {formatClock(game.clock_seconds)}
                </span>
              ) : isFinal ? (
                <span className="chip chip-final">
                  FINAL{game.decided_in && game.decided_in !== "regulation" ? `/${game.decided_in.toUpperCase()}` : ""}
                </span>
              ) : (
                <span className="chip">UPCOMING</span>
              )}
            </div>
          </div>

          {/* Teams + scores — vertical stack on mobile, three-column on md+ */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-5 md:gap-8">
            <TeamColumn team={awayView} score={game.away_score} won={awayWon} dimmed={isFinal && !awayWon} align="left" />
            <div className="flex md:flex-col items-center justify-center md:justify-start gap-3 md:gap-0">
              <div className="h-px flex-1 md:hidden bg-rule-strong" />
              <div className="font-display text-[18px] md:text-[24px] tracking-[0.18em] text-ink-faint">VS</div>
              <div className="h-px flex-1 md:hidden bg-rule-strong" />
              <div className="mt-2 hidden md:block h-px w-12 bg-rule-strong" />
            </div>
            <TeamColumn team={homeView} score={game.home_score} won={homeWon} dimmed={isFinal && !homeWon} align="right" />
          </div>

          {game.decided_in === "shootout" && (
            <div className="mt-8 pt-6 border-t border-rule grid grid-cols-3 items-center gap-4 text-center">
              <div className="text-left">
                <div className="eyebrow">Shootout</div>
                <div className="digit text-2xl mt-1">{game.shootout_away_goals}</div>
              </div>
              <div className="eyebrow">final tally</div>
              <div className="text-right">
                <div className="eyebrow">Shootout</div>
                <div className="digit text-2xl mt-1">{game.shootout_home_goals}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AVAILABILITY (scheduled games) */}
      {availability && (
        <section className="rise delay-1 space-y-4">
          <SectionHeader eyebrow="Roster" title="Availability" subtitle="Who's in for this game" />
          {availability.viewerCanCheckIn && (
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
            <TeamAvailabilityCard team={awayView} avail={availability.away} />
            <TeamAvailabilityCard team={homeView} avail={availability.home} />
          </div>
        </section>
      )}

      {/* EVENTS LOG */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="Play-by-play" title="Scoring & Penalties" />
        {events.length === 0 ? (
          <p className="eyebrow">No events recorded.</p>
        ) : (
          <ol className="space-y-1.5">
            {events.map((e, idx) => {
              const team = e.team_id === homeView.id ? homeView : awayView;
              const isGoal = e.type === "goal";
              return (
                <li
                  key={e.id}
                  className={`panel p-3 grid grid-cols-[auto_1fr] md:grid-cols-[auto_72px_1fr_auto] gap-x-4 gap-y-1 items-start border-l-[3px] md:border-l-2`}
                  style={{ borderLeftColor: team.color, borderLeftStyle: "solid" }}
                >
                  {/* Index */}
                  <div className="digit text-ink-faint text-sm">
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  {/* Clock */}
                  <div className="hidden md:flex flex-col items-center">
                    <span className="eyebrow text-[9px]">{formatPeriod(e.period)}</span>
                    <span className="digit text-lg text-ink mt-0.5">
                      {formatClock(e.clock_seconds)}
                    </span>
                  </div>
                  {/* Body */}
                  <div className="col-span-1 md:col-span-1">
                    <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                      <span
                        className={`font-display text-[13px] tracking-[0.16em] ${
                          isGoal ? "text-goal" : "text-ice"
                        }`}
                      >
                        {isGoal ? "GOAL" : "PENALTY"}
                      </span>
                      <span className="md:hidden eyebrow text-[10px]">
                        {formatPeriod(e.period)} · {formatClock(e.clock_seconds)}
                        <span style={{ color: team.color }}> · {team.name}</span>
                      </span>
                    </div>
                    {isGoal && e.scorer && (
                      <div className="text-[15px]">
                        <Link href={`/players/${e.scorer.id}`} className="font-medium hover:text-ice transition-colors">
                          {e.scorer.first_name} {e.scorer.last_name}
                        </Link>
                        {(e.assist1 || e.assist2) && (
                          <span className="text-[13px] text-ink-dim">
                            {" · "}
                            <span className="eyebrow text-[9px]">A</span>{" "}
                            {[e.assist1, e.assist2]
                              .filter(Boolean)
                              .map((a) => `${a!.first_name} ${a!.last_name}`)
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                    {!isGoal && e.scorer && (
                      <>
                        <div className="text-[15px]">
                          <Link href={`/players/${e.scorer.id}`} className="font-medium hover:text-ice transition-colors">
                            {e.scorer.first_name} {e.scorer.last_name}
                          </Link>
                          <span className="text-ink-dim"> · {e.penalty_type}</span>
                        </div>
                        {e.shooter && (
                          <div className="mt-2 text-[13px] flex items-center gap-2 flex-wrap">
                            <span className="eyebrow text-[10px]">PS</span>
                            <Link href={`/players/${e.shooter.id}`} className="hover:text-ink transition-colors text-ink-dim">
                              {e.shooter.first_name} {e.shooter.last_name}
                            </Link>
                            <span
                              className={`font-display tracking-[0.16em] text-[12px] ${
                                e.penalty_shot_result === "goal" ? "text-goal" : "text-ice"
                              }`}
                            >
                              · {e.penalty_shot_result === "goal" ? "GOAL" : "SAVED"}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {/* Team marker */}
                  <div className="hidden md:flex items-center gap-2 text-right justify-self-end">
                    <span className="eyebrow">{team.name}</span>
                    <span
                      aria-hidden
                      className="w-1 h-5 rounded-[1px]"
                      style={{ background: team.color, boxShadow: `0 0 8px ${team.color}55` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function TeamAvailabilityCard({ team, avail }: { team: TeamRef; avail: TeamAvail }) {
  return (
    <div
      className="panel p-4 space-y-3"
      style={{ borderLeftColor: team.color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
    >
      <div className="flex items-center justify-between gap-2">
        <TeamBadge name={team.name} slug={team.slug} color={team.color} size="sm" />
        <span className="eyebrow text-ink-faint">
          {avail.in.length} in · {avail.out.length} out
        </span>
      </div>
      <AvailGroup label="In" color="text-goal" players={avail.in} />
      <AvailGroup label="Out" color="text-ice" players={avail.out} />
      <AvailGroup label="No response" color="text-ink-faint" players={avail.none} />
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
            <Link href={`/players/${p.id}`} className="hover:text-ink transition-colors">
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
  score,
  won,
  dimmed,
  align,
}: {
  team: { name: string; slug: string; color: string };
  score: number;
  won: boolean;
  dimmed: boolean;
  align: "left" | "right";
}) {
  // Mobile: badge | score on one row. md+: stacked column with align controlling
  // text alignment so home is right-aligned, away is left-aligned.
  const colAlign =
    align === "right"
      ? "md:flex-col md:items-end md:text-right"
      : "md:flex-col md:items-start md:text-left";
  const eyebrowAlign = align === "right" ? "md:text-right" : "md:text-left";
  return (
    <div className={`flex items-center justify-between gap-4 ${colAlign}`}>
      <Link href={`/teams/${team.slug}`} className="group min-w-0 flex-1 md:flex-initial">
        <div className={`eyebrow ${eyebrowAlign}`}>
          {align === "left" ? "Away" : "Home"}
        </div>
        <div
          className={`mt-2 font-display text-[22px] sm:text-[26px] md:text-[34px] leading-[0.95] tracking-[0.04em] ${
            dimmed ? "text-ink-dim" : "text-ink"
          } group-hover:text-ice transition-colors`}
        >
          {team.name.toUpperCase()}
        </div>
        <div
          className={`mt-2 h-1 w-12 ${align === "right" ? "md:ml-auto" : ""}`}
          style={{ background: team.color, boxShadow: `0 0 12px ${team.color}77` }}
        />
      </Link>
      <div
        className={`digit text-[40px] md:text-[64px] leading-none md:mt-2 shrink-0 ${
          won ? "text-ink" : dimmed ? "text-ink-faint" : "text-ink"
        }`}
        style={won ? { textShadow: `0 0 24px ${team.color}66` } : undefined}
      >
        {score}
      </div>
    </div>
  );
}
