// Emits SQL to (re)seed the local current season with a full demo dataset for
// trying/ demoing the app locally:
//   • N teams (4 = even/no byes, 5 = odd/byes)
//   • rosters (6 F, 2 D, 1 G per team, with a captain)
//   • a 10-week schedule (2 games/night) + playoff stubs (TBD)
//   • the first 7 weeks played (final scores + goal/penalty events + appearances)
// so standings, /stats leaders, schedule, and byes all populate.
//
//   bun run scripts/local/seed-sample.ts [4|5]   # prints SQL
//   scripts/local/seed-sample.sh 5               # runs it against local DB
//
// Local only; assumes the seeded current season (id + start_date below). Uses the
// real round-robin/slot helpers so byes + playoff dates match the app. Re-runnable:
// it wipes the season's games/rosters/stats and cleans up orphaned seed players.
import {
  roundRobinGames,
  buildGameSlots,
  buildPlayoffSlots,
} from "../../lib/season-schedule.ts";

const SEASON = "00000000-0000-0000-0000-000000000001";
const START = "2026-03-01";
const WEEKS = 10;
const TIMES = ["19:00", "20:30"];
const PLAYED_WEEKS = 7; // finalize the first 7 weeks; rest stay upcoming
const weekday = new Date(2026, 2, 1).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

const count = Number(process.argv[2] ?? "5");
if (count !== 4 && count !== 5) {
  console.error("Usage: seed-sample.ts [4|5]");
  process.exit(1);
}

const ALL_TEAMS = [
  { name: "Frost Giants", slug: "frost-giants", color: "#4aa8ff" },
  { name: "Ember Wolves", slug: "ember-wolves", color: "#ff7a3c" },
  { name: "Iron Ravens", slug: "iron-ravens", color: "#9aa4b2" },
  { name: "Green Vipers", slug: "green-vipers", color: "#3ecf8e" },
  { name: "Crimson Bears", slug: "crimson-bears", color: "#ef4444" },
];

const FIRST = ["Alex","Sam","Jordan","Casey","Riley","Morgan","Taylor","Jamie","Drew","Quinn","Reese","Avery","Parker","Rowan","Sage","Blake","Cameron","Devon","Elliot","Frankie","Harper","Kai","Lane","Marlow"];
const LAST = ["Carter","Nash","Ward","Boyd","Frost","Vance","Hale","Cole","Reed","Pike","Lund","Rask","Mott","Kane","Doan","Ellis","Byrne","Shaw","Cross","Dolan","Fenn","Groh","Iver","Judd"];
const JERSEYS = [7, 9, 11, 13, 17, 19, 4, 5, 30];
const POSITIONS = ["forward","forward","forward","forward","forward","forward","defense","defense","goalie"] as const;

const ri = (n: number) => Math.floor(Math.random() * n); // 0..n-1
const pick = <T,>(a: T[]) => a[ri(a.length)];

const teams = ALL_TEAMS.slice(0, count).map((t) => ({ ...t, id: crypto.randomUUID() }));

// Rosters — 9 players/team; track skaters (non-goalie) for scoring.
type P = { id: string; first: string; last: string; jersey: number; pos: string; captain: boolean };
const players: P[] = [];
const rosterByTeam = new Map<string, { all: P[]; skaters: P[] }>();
let nameIdx = 0;
for (const t of teams) {
  const all: P[] = [];
  for (let i = 0; i < 9; i++) {
    const p: P = {
      id: crypto.randomUUID(),
      first: FIRST[nameIdx % FIRST.length],
      last: LAST[(nameIdx * 7 + 3) % LAST.length],
      jersey: JERSEYS[i],
      pos: POSITIONS[i],
      captain: i === 0,
    };
    nameIdx++;
    players.push(p);
    all.push(p);
  }
  rosterByTeam.set(t.id, { all, skaters: all.filter((p) => p.pos !== "goalie") });
}

const pairs = roundRobinGames(teams.map((t) => t.id), WEEKS * TIMES.length);
const slots = buildGameSlots(START, weekday, TIMES, pairs.length);
const ps = buildPlayoffSlots(START, weekday, TIMES, pairs.length);
const playedGames = PLAYED_WEEKS * TIMES.length;

type GameRow = {
  id: string; home: string; away: string; at: string;
  status: "scheduled" | "final"; hs: number; as: number; decided: string | null;
};
const appearances: string[] = []; // VALUES rows
const events: string[] = []; // VALUES rows
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const games: GameRow[] = pairs.map(([home, away], i) => {
  if (i >= playedGames) {
    return { id: crypto.randomUUID(), home, away, at: slots[i], status: "scheduled", hs: 0, as: 0, decided: null };
  }
  // Played game: pick a winner + scores; OT ~25% (margin 1).
  const homeWins = Math.random() < 0.5;
  const winGoals = 2 + ri(5); // 2..6
  const ot = Math.random() < 0.25;
  const loseGoals = ot ? winGoals - 1 : ri(winGoals); // 0..winGoals-1
  const hs = homeWins ? winGoals : loseGoals;
  const as = homeWins ? loseGoals : winGoals;
  const id = crypto.randomUUID();

  // Goals + penalties + appearances for both teams.
  for (const [teamId, goals] of [[home, hs], [away, as]] as const) {
    const roster = rosterByTeam.get(teamId)!;
    for (const p of roster.all) {
      appearances.push(`(${q(id)}, ${q(p.id)}, ${q(teamId)}, false)`);
    }
    for (let g = 0; g < goals; g++) {
      const scorer = pick(roster.skaters);
      const others = roster.skaters.filter((s) => s.id !== scorer.id);
      const a1 = Math.random() < 0.7 && others.length ? pick(others) : null;
      const a2 = a1 && Math.random() < 0.35
        ? pick(others.filter((s) => s.id !== a1.id)) : null;
      events.push(
        `(${q(id)}, ${1 + ri(3)}, ${ri(1200)}, 'goal', ${q(teamId)}, ${q(scorer.id)}, ${a1 ? q(a1.id) : "NULL"}, ${a2 ? q(a2.id) : "NULL"})`,
      );
    }
  }
  return { id, home, away, at: slots[i], status: "final", hs, as, decided: ot ? "ot" : "regulation" };
});

const lines: string[] = ["BEGIN;"];
// Wipe the season's schedule/roster/stats, then clean up orphaned seed players
// (userless players no longer referenced anywhere) so re-runs don't accumulate.
lines.push(`DELETE FROM games WHERE season_id = ${q(SEASON)};`);
lines.push(`DELETE FROM season_player_stats WHERE season_id = ${q(SEASON)};`);
lines.push(`DELETE FROM team_players WHERE season_id = ${q(SEASON)};`);
lines.push(`DELETE FROM teams WHERE season_id = ${q(SEASON)};`);
lines.push(
  `DELETE FROM players p WHERE p.user_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM team_players tp WHERE tp.player_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM game_appearances ga WHERE ga.player_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM game_events ge WHERE p.id IN (ge.player_id, ge.assist1_player_id, ge.assist2_player_id, ge.penalty_shot_taker_id));`,
);

lines.push(
  `INSERT INTO teams (id, season_id, name, slug, color) VALUES\n  ` +
    teams.map((t) => `(${q(t.id)}, ${q(SEASON)}, ${q(t.name)}, ${q(t.slug)}, ${q(t.color)})`).join(",\n  ") + ";",
);
lines.push(
  `INSERT INTO players (id, first_name, last_name) VALUES\n  ` +
    players.map((p) => `(${q(p.id)}, ${q(p.first)}, ${q(p.last)})`).join(",\n  ") + ";",
);
lines.push(
  `INSERT INTO team_players (team_id, player_id, season_id, jersey_number, position, is_captain) VALUES\n  ` +
    teams.flatMap((t) =>
      rosterByTeam.get(t.id)!.all.map((p) =>
        `(${q(t.id)}, ${q(p.id)}, ${q(SEASON)}, ${p.jersey}, ${q(p.pos)}, ${p.captain})`,
      ),
    ).join(",\n  ") + ";",
);
lines.push(
  `INSERT INTO games (id, season_id, home_team_id, away_team_id, scheduled_at, kind, status, home_score, away_score, decided_in) VALUES\n  ` +
    games.map((g) =>
      `(${q(g.id)}, ${q(SEASON)}, ${q(g.home)}, ${q(g.away)}, ${q(g.at)}, 'regular', ${q(g.status)}, ${g.hs}, ${g.as}, ${g.decided ? q(g.decided) : "NULL"})`,
    ).join(",\n  ") + ";",
);
// Playoff stubs (TBD).
lines.push(
  `INSERT INTO games (season_id, home_team_id, away_team_id, scheduled_at, kind, status, playoff_round) VALUES\n  ` +
    ([["sf1", ps.sf1], ["sf2", ps.sf2], ["final", ps.final]] as const)
      .map(([r, at]) => `(${q(SEASON)}, NULL, NULL, ${q(at)}, 'playoff', 'scheduled', ${q(r)})`).join(",\n  ") + ";",
);
if (appearances.length) {
  lines.push(`INSERT INTO game_appearances (game_id, player_id, team_id, is_sub) VALUES\n  ` + appearances.join(",\n  ") + ";");
}
if (events.length) {
  lines.push(
    `INSERT INTO game_events (game_id, period, clock_seconds, type, team_id, player_id, assist1_player_id, assist2_player_id) VALUES\n  ` +
      events.join(",\n  ") + ";",
  );
}
lines.push("COMMIT;");
console.log(lines.join("\n"));
