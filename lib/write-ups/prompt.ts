// System prompt and model inputs for game write-ups. Pure: the data layer
// loads rows, these shape them into the JSON contract from the spec. Field
// names are deliberate — the bake-off showed models misread unlabeled data
// (result order) and invent what's missing (the weekday).
import type { KeyMatchup, Lineup, ProjectedRoster, Projection, Scorer, TeamForm } from "@/lib/matchup";
import { formatClock, formatPeriod } from "@/lib/format";

export type WriteUpKind = "preview" | "recap";

// The league plays in US Eastern. Nothing else in the app pins a timezone;
// server-rendered dates otherwise follow the host (UTC on Vercel).
export const LEAGUE_TIME_ZONE = "America/New_York";

export const SYSTEM_PROMPT = `You write short game write-ups for M.O.T.H. ("Mostly Over The Hill"), a friendly adult rec hockey league. Readers are the players themselves.

Rules:
- Use ONLY facts in the provided JSON. Never invent stats, plays, quotes, injuries, dates, or history. If something isn't in the data, don't mention it.
- 120-160 words. First line is a headline (no quotes, no markdown). Then a blank line, then the body as plain prose — no bullet points, no markdown.
- Tone: fun and a little playful, like a league newsletter. PG. Light ribbing of a TEAM's record is fine; never mock an individual player.
- Don't summarize a streak or pattern unless every game in it fits the description.
- Previews: projections are for fun, not betting advice. You may mention the projected total and who's slightly favored. If few players have checked in, say rosters are still TBD rather than guessing. Only name absent players listed in out_key_players, and never guess why anyone is out. Name subs who are lined up.
- Recaps: tell the story of the game from the goal sequence (leads, comebacks, the winner). Credit scorers by name. Credit a sub who scored or assisted as a sub. Mention a short bench only if a team dressed fewer than 7 skaters.
- A goal with penalty_shot true was scored on a penalty shot; say so.
- If shootout is present, the game was decided in a shootout; never credit any player with the shootout goal.`;

export type PreviewTeam = { name: string; form: TeamForm; topScorers: Scorer[]; roster: ProjectedRoster };

export type PreviewSource = {
  scheduledAt: string;
  home: PreviewTeam;
  away: PreviewTeam;
  projection: Projection | null;
  keyMatchup: KeyMatchup | null;
};

export type RecapTeam = { name: string; recordAfter: string; lineup: Lineup };
export type RecapGoal = {
  period: number;
  clockSeconds: number;
  team: string;
  scorer: string;
  scorerIsSub: boolean;
  assists: string[];
  penaltyShot: boolean;
};
export type RecapPenalty = {
  period: number;
  clockSeconds: number;
  team: string;
  player: string;
  penalty: string;
  shotResult: "goal" | "saved" | null;
  shooter: string | null;
};

export type RecapSource = {
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  decidedIn: "regulation" | "ot" | "shootout" | null;
  periodLengthSeconds: number;
  home: RecapTeam;
  away: RecapTeam;
  // In game order: period ascending, clock (time remaining) descending.
  goals: RecapGoal[];
  penalties: RecapPenalty[];
  shootout: { homeGoals: number; awayGoals: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function leagueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function leagueTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function previewTeam(t: PreviewTeam) {
  return {
    name: t.name,
    record: t.form.record,
    points: t.form.points,
    gp: t.form.gp,
    goals_for: t.form.goalsFor,
    goals_against: t.form.goalsAgainst,
    gf_per_game: round2(t.form.gfPerGame),
    ga_per_game: round2(t.form.gaPerGame),
    last_3_most_recent_first: t.form.lastThreeMostRecentFirst,
    top_scorers: t.topScorers.map((s) => ({ name: s.name, goals: s.goals })),
    rostered_goalie: t.roster.rosteredGoalie,
    availability: {
      roster_size: t.roster.rosterSize,
      checked_in: t.roster.inCount,
      out: t.roster.outCount,
      out_key_players: t.roster.outKeyPlayers,
      no_response: t.roster.noResponseCount,
    },
    subs_lined_up: t.roster.subsLinedUp,
  };
}

function shapeKeyMatchup(km: KeyMatchup) {
  return {
    scorer: { name: km.scorer.name, team: km.scorer.team, goals: km.scorer.goals },
    goalie: { name: km.goalie.name, team: km.goalie.team, team_ga_per_game: round2(km.goalie.teamGaPerGame) },
  };
}

export function buildPreviewInput(src: PreviewSource): Record<string, unknown> {
  return {
    game: {
      home: src.home.name,
      away: src.away.name,
      when: `${leagueDate(src.scheduledAt)} at ${leagueTime(src.scheduledAt)}`,
    },
    home_team: previewTeam(src.home),
    away_team: previewTeam(src.away),
    projection: src.projection
      ? {
          expected_goals_home: src.projection.expectedGoalsHome,
          expected_goals_away: src.projection.expectedGoalsAway,
          over_under_line: src.projection.overUnderLine,
          win_probability_home: round2(src.projection.winProbabilityHome),
          win_probability_away: round2(src.projection.winProbabilityAway),
          moneyline_home: src.projection.moneylineHome,
          moneyline_away: src.projection.moneylineAway,
        }
      : "not available yet (fewer than 2 games played)",
    key_matchup: src.keyMatchup ? shapeKeyMatchup(src.keyMatchup) : "none",
  };
}

const DECIDED: Record<string, string> = { regulation: "regulation", ot: "overtime", shootout: "shootout" };

/** Elapsed seconds for an event given time remaining and period length. Clamped ≥ 0. */
function elapsedSeconds(clockSeconds: number, period: number, periodLengthSeconds: number): number {
  const len = period === 4 ? 300 : periodLengthSeconds;
  return Math.max(0, len - clockSeconds);
}

export function buildRecapInput(src: RecapSource): Record<string, unknown> {
  let home = 0;
  let away = 0;
  const goals = src.goals.map((g) => {
    if (g.team === src.home.name) home++;
    else away++;
    return {
      period: formatPeriod(g.period),
      time: formatClock(elapsedSeconds(g.clockSeconds, g.period, src.periodLengthSeconds)),
      team: g.team,
      scorer: g.scorer,
      scorer_is_sub: g.scorerIsSub,
      assists: g.assists.length ? g.assists.join(", ") : null,
      score_after: `${src.home.name} ${home}, ${src.away.name} ${away}`,
      penalty_shot: g.penaltyShot,
    };
  });

  const lineup = (l: Lineup) => ({ skaters_dressed: l.skatersDressed, goalie: l.goalie, subs: l.subs });

  const result: Record<string, unknown> = {
    game: {
      home: src.home.name,
      away: src.away.name,
      played_on: leagueDate(src.scheduledAt),
      final: `${src.home.name} ${src.homeScore}, ${src.away.name} ${src.awayScore}`,
      decided_in: DECIDED[src.decidedIn ?? "regulation"],
    },
    goals,
    penalties: src.penalties.map((p) => ({
      period: formatPeriod(p.period),
      time: formatClock(elapsedSeconds(p.clockSeconds, p.period, src.periodLengthSeconds)),
      team: p.team,
      player: p.player,
      penalty: p.penalty,
      shot_result: p.shotResult,
      shooter: p.shooter,
    })),
    lineups: { [src.home.name]: lineup(src.home.lineup), [src.away.name]: lineup(src.away.lineup) },
    records_after: { [src.home.name]: src.home.recordAfter, [src.away.name]: src.away.recordAfter },
  };

  if (src.shootout) {
    const winner = src.shootout.homeGoals > src.shootout.awayGoals ? src.home.name : src.away.name;
    result.shootout = {
      winner,
      home_goals: src.shootout.homeGoals,
      away_goals: src.shootout.awayGoals,
      note: "The final score includes 1 goal awarded to the shootout winner. No player is credited with it.",
    };
  }

  return result;
}

export function userMessage(kind: WriteUpKind, input: Record<string, unknown>): string {
  return `Write the ${kind}. Data:\n${JSON.stringify(input, null, 2)}`;
}
