// The recap page's computed sections, and the compact facts JSON the AI
// season summary is written from (stored next to the summary as `input`).
import type { SeasonRecap } from "@/lib/queries";
import { computeSeasonTotals, type SeasonTotals } from "@/lib/season-finalize";
import {
  describeMoment,
  goalieMinGames,
  notableMoments,
  playoffPath,
  seasonNumbers,
  topGoalies,
  topSkaters,
  winnerOf,
  type Moment,
  type Names,
  type RecapGame,
  type SeasonNumbers,
} from "@/lib/season-recap";

export type RecapComputed = {
  regular: SeasonTotals[];
  playoffTotals: SeasonTotals[];
  regNumbers: SeasonNumbers | null;
  poNumbers: SeasonNumbers | null;
  regMoments: Moment[];
  poMoments: Moment[];
  path: RecapGame[];
  minGoalieGames: number;
};

// Everything the recap page derives from game data. Regular season and
// playoffs stay separate.
export function computeRecap(r: SeasonRecap): RecapComputed {
  const { games, roster, appearances, events } = r.inputs;
  const rosterTeam = new Map(roster.map((x) => [x.player_id, x.team_id]));
  return {
    regular: r.hasGames ? computeSeasonTotals(games, roster, appearances, events) : (r.storedTotals ?? []),
    playoffTotals: r.hasGames ? computeSeasonTotals(games, roster, appearances, events, { kind: "playoff" }) : [],
    regNumbers: seasonNumbers(r.games, events, "regular"),
    poNumbers: seasonNumbers(r.games, events, "playoff"),
    regMoments: notableMoments(r.games, events, "regular", rosterTeam),
    poMoments: notableMoments(r.games, events, "playoff", rosterTeam),
    path: playoffPath(r.games),
    minGoalieGames: goalieMinGames(r.games, "regular"),
  };
}

type Leader = { player: string; team: string | null; value: number };

export type RecapFacts = {
  season: { name: string; start: string; end: string | null };
  champion: string | null;
  standings: { team: string; record: string; pts: number; gf: number; ga: number }[] | null;
  historicalStandings: { team: string; gf: number; ga: number; diff: number }[] | null;
  regular: {
    numbers: SeasonNumbers | null;
    leaders: { points: Leader[]; goals: Leader[]; assists: Leader[]; goalies: { player: string; team: string | null; gaa: number; gp: number }[] };
    moments: string[];
  };
  playoffs: {
    /** `score` is away-home. */
    games: { round: string; away: string; home: string; score: string; winner: string | null; decidedIn: string }[];
    leaders: Leader[];
    moments: string[];
  } | null;
  awards: { award: string; winners: string[] }[];
};

export function buildRecapFacts(r: SeasonRecap, c: RecapComputed): RecapFacts {
  const names: Names = { teams: r.teams, players: r.players };
  const team = (id: string | null) => (id ? r.teams.get(id)?.name ?? null : null);
  const player = (id: string) => r.players.get(id)?.name ?? "Unknown player";
  const byId = new Map(r.games.map((g) => [g.id, g]));
  const leader = (t: SeasonTotals, value: number): Leader => ({ player: player(t.player_id), team: team(t.team_id), value });
  const moments = (list: Moment[]) =>
    list.map((m) => {
      const { label, text } = describeMoment(m, byId.get(m.gameId ?? ""), names);
      return `${label}: ${text}`;
    });
  const lastFinal = r.games.filter((g) => g.status === "final").map((g) => g.scheduled_at).sort().at(-1);

  return {
    season: { name: r.season.name, start: r.season.start_date, end: lastFinal ? lastFinal.slice(0, 10) : null },
    champion: team(r.championTeamId),
    standings: r.standings?.map((s) => ({ team: s.name, record: `${s.w}-${s.l}-${s.otl}`, pts: s.pts, gf: s.gf, ga: s.ga })) ?? null,
    historicalStandings: r.standings ? null : (r.historical?.map((s) => ({ team: s.name, gf: s.gf, ga: s.ga, diff: s.diff })) ?? null),
    regular: {
      numbers: c.regNumbers,
      leaders: {
        points: topSkaters(c.regular, "points").map((t) => leader(t, t.goals + t.assists)),
        goals: topSkaters(c.regular, "goals").map((t) => leader(t, t.goals)),
        assists: topSkaters(c.regular, "assists").map((t) => leader(t, t.assists)),
        goalies: topGoalies(c.regular, c.minGoalieGames).map((t) => ({
          player: player(t.player_id),
          team: team(t.team_id),
          gaa: Math.round(((t.goals_against ?? 0) / t.games_played) * 100) / 100,
          gp: t.games_played,
        })),
      },
      moments: moments(c.regMoments),
    },
    playoffs:
      c.path.length === 0
        ? null
        : {
            games: c.path.map((g) => ({
              round: g.playoff_round ?? "playoff",
              away: team(g.away_team_id) ?? "TBD",
              home: team(g.home_team_id) ?? "TBD",
              score: `${g.away_score}-${g.home_score}`,
              winner: team(winnerOf(g)),
              decidedIn: g.decided_in ?? "regulation",
            })),
            leaders: topSkaters(c.playoffTotals, "points").map((t) => leader(t, t.goals + t.assists)),
            moments: moments(c.poMoments),
          },
    awards: r.awards.map((a) => ({ award: a.label, winners: a.winners.map((w) => w.name) })),
  };
}
