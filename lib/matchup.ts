// Pure matchup statistics. No database access here: the game page and the
// write-up generator both load rows, then call these. Keep it that way so the
// numbers can be checked against fixed inputs with `bun test`.
import type { StandingsRow } from "@/lib/queries";

export type Position = "forward" | "defense" | "goalie";
export type DecidedIn = "regulation" | "ot" | "shootout";

export type FinalGame = {
  id: string;
  scheduledAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  decidedIn: DecidedIn | null;
};

export type GoalEvent = {
  teamId: string;
  playerId: string;
  period: number;
  clockSeconds: number;
  assist1Id: string | null;
  assist2Id: string | null;
};

export type RosterEntry = { playerId: string; name: string; teamId: string; position: Position };
export type LineupEntry = { name: string; position: Position; isSub: boolean };

export type TeamForm = {
  gp: number;
  record: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  gfPerGame: number;
  gaPerGame: number;
  // Explicit ordering in the name: the bake-off showed models misread an
  // unlabeled list as oldest-first.
  lastThreeMostRecentFirst: string[];
};

export type Scorer = { playerId: string; name: string; goals: number };

export type Projection = {
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  overUnderLine: number;
  winProbabilityHome: number;
  winProbabilityAway: number;
  moneylineHome: string;
  moneylineAway: string;
};

export type TeamSide = { team: string; topScorer: Scorer | null; goalie: string | null; form: TeamForm };

export type KeyMatchup = {
  scorer: { name: string; team: string; goals: number };
  goalie: { name: string; team: string; teamGaPerGame: number };
};

export type ProjectedRoster = {
  rosterSize: number;
  inCount: number;
  outCount: number;
  // Only top scorers / the goalie are named when out; everyone else is a count.
  outKeyPlayers: string[];
  noResponseCount: number;
  rosteredGoalie: string | null;
  subsLinedUp: { name: string; position: Position }[];
};

export type Lineup = { skatersDressed: number; goalie: string | null; subs: string[] };

export const MIN_GAMES_FOR_PROJECTION = 2;

export function teamForm(
  standing: StandingsRow,
  games: FinalGame[],
  teamId: string,
  teamName: (id: string) => string,
): TeamForm {
  const mine = games
    .filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 3);

  const lastThree = mine.map((g) => {
    const home = g.homeTeamId === teamId;
    const gf = home ? g.homeScore : g.awayScore;
    const ga = home ? g.awayScore : g.homeScore;
    const extra = g.decidedIn === "ot" || g.decidedIn === "shootout";
    const result = gf > ga ? "W" : extra ? "OTL" : "L";
    const suffix = extra ? ` (${g.decidedIn === "ot" ? "OT" : "SO"})` : "";
    return `${result} ${gf}-${ga} vs ${teamName(home ? g.awayTeamId : g.homeTeamId)}${suffix}`;
  });

  return {
    gp: standing.gp,
    record: `${standing.w}-${standing.l}-${standing.otl}`,
    points: standing.pts,
    goalsFor: standing.gf,
    goalsAgainst: standing.ga,
    gfPerGame: standing.gp ? standing.gf / standing.gp : 0,
    gaPerGame: standing.gp ? standing.ga / standing.gp : 0,
    lastThreeMostRecentFirst: lastThree,
  };
}

export function topScorers(
  goals: GoalEvent[],
  teamId: string,
  nameOf: (playerId: string) => string,
  n = 2,
): Scorer[] {
  const counts = new Map<string, number>();
  for (const g of goals) {
    if (g.teamId !== teamId) continue;
    counts.set(g.playerId, (counts.get(g.playerId) ?? 0) + 1);
  }
  return [...counts]
    .map(([playerId, count]) => ({ playerId, name: nameOf(playerId), goals: count }))
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function moneyline(p: number): string {
  if (p >= 0.5) return `-${Math.round((100 * p) / (1 - p))}`;
  return `+${Math.round((100 * (1 - p)) / p)}`;
}

function poisson(lambda: number, k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / f;
}

export function projectMatchup(home: TeamForm, away: TeamForm): Projection | null {
  if (home.gp < MIN_GAMES_FOR_PROJECTION || away.gp < MIN_GAMES_FOR_PROJECTION) return null;
  // Each side's expected goals blend its own scoring rate with the other
  // side's conceding rate.
  const lamH = (home.gfPerGame + away.gaPerGame) / 2;
  const lamA = (away.gfPerGame + home.gaPerGame) / 2;

  let pHome = 0;
  let pAway = 0;
  let pTie = 0;
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 15; j++) {
      const p = poisson(lamH, i) * poisson(lamA, j);
      if (i > j) pHome += p;
      else if (j > i) pAway += p;
      else pTie += p;
    }
  }
  // Regulation ties go to OT/shootout; call that a coin flip. Normalize so the
  // two probabilities sum to exactly 1 despite the truncated grid.
  const total = pHome + pAway + pTie;
  const winHome = (pHome + pTie / 2) / total;
  const winAway = 1 - winHome;

  return {
    expectedGoalsHome: Math.round(lamH * 100) / 100,
    expectedGoalsAway: Math.round(lamA * 100) / 100,
    overUnderLine: Math.floor(lamH + lamA) + 0.5,
    winProbabilityHome: winHome,
    winProbabilityAway: winAway,
    moneylineHome: moneyline(winHome),
    moneylineAway: moneyline(winAway),
  };
}

export function keyMatchup(home: TeamSide, away: TeamSide): KeyMatchup | null {
  // The stronger of the two top scorers takes on the other team's goalie;
  // ties go to the home side.
  const homeGoals = home.topScorer?.goals ?? -1;
  const awayGoals = away.topScorer?.goals ?? -1;
  const [attack, defend] = homeGoals >= awayGoals ? [home, away] : [away, home];
  if (!attack.topScorer || !defend.goalie) return null;
  return {
    scorer: { name: attack.topScorer.name, team: attack.team, goals: attack.topScorer.goals },
    goalie: { name: defend.goalie, team: defend.team, teamGaPerGame: defend.form.gaPerGame },
  };
}

export function projectedRoster(
  roster: RosterEntry[],
  status: Map<string, "in" | "out">,
  subs: { name: string; position: Position }[],
  keyPlayerIds: Set<string>,
): ProjectedRoster {
  let inCount = 0;
  let outCount = 0;
  const outKeyPlayers: string[] = [];
  for (const p of roster) {
    const s = status.get(p.playerId);
    if (s === "in") inCount++;
    else if (s === "out") {
      outCount++;
      if (keyPlayerIds.has(p.playerId)) outKeyPlayers.push(p.name);
    }
  }
  return {
    rosterSize: roster.length,
    inCount,
    outCount,
    outKeyPlayers,
    noResponseCount: roster.length - inCount - outCount,
    rosteredGoalie: roster.find((p) => p.position === "goalie")?.name ?? null,
    subsLinedUp: subs,
  };
}

export function gameLineup(entries: LineupEntry[]): Lineup {
  return {
    skatersDressed: entries.filter((e) => e.position !== "goalie").length,
    goalie: entries.find((e) => e.position === "goalie")?.name ?? null,
    subs: entries.filter((e) => e.isSub).map((e) => e.name),
  };
}
