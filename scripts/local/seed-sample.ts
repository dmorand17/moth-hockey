// Emits SQL to (re)seed the local current season with a sample team set +
// schedule, for trying the schedule/bye/playoff features locally.
//
//   bun run scripts/local/seed-sample.ts [4|5]   # prints SQL to stdout
//   scripts/local/seed-sample.sh 5               # runs it against local DB
//
// Uses the real round-robin + slot helpers so byes and playoff dates match the
// app exactly. 5 teams (odd) → one bye per week; 4 teams (even) → no byes.
// Assumes the seeded local current season (id + start_date below).
import {
  roundRobinGames,
  buildGameSlots,
  buildPlayoffSlots,
} from "../../lib/season-schedule.ts";

const SEASON = "00000000-0000-0000-0000-000000000001"; // seeded current season
const START = "2026-03-01"; // its start_date
const WEEKS = 10;
const TIMES = ["19:00", "20:30"]; // 2 game slots per night
const weekday = new Date(2026, 2, 1).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ALL_TEAMS = [
  { name: "Frost Giants", slug: "frost-giants", color: "#4aa8ff" },
  { name: "Ember Wolves", slug: "ember-wolves", color: "#ff7a3c" },
  { name: "Iron Ravens", slug: "iron-ravens", color: "#9aa4b2" },
  { name: "Green Vipers", slug: "green-vipers", color: "#3ecf8e" },
  { name: "Crimson Bears", slug: "crimson-bears", color: "#ef4444" },
];

const count = Number(process.argv[2] ?? "5");
if (count !== 4 && count !== 5) {
  console.error("Usage: seed-sample.ts [4|5]");
  process.exit(1);
}

const teams = ALL_TEAMS.slice(0, count).map((t) => ({
  ...t,
  id: crypto.randomUUID(),
}));
const ids = teams.map((t) => t.id);

const pairs = roundRobinGames(ids, WEEKS * TIMES.length);
const slots = buildGameSlots(START, weekday, TIMES, pairs.length);
const ps = buildPlayoffSlots(START, weekday, TIMES, pairs.length);

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lines: string[] = ["BEGIN;"];

// Wipe the current season's schedule + roster/stats so we can reset the teams.
lines.push(`DELETE FROM games WHERE season_id = ${q(SEASON)};`);
lines.push(`DELETE FROM season_player_stats WHERE season_id = ${q(SEASON)};`);
lines.push(`DELETE FROM team_players WHERE season_id = ${q(SEASON)};`);
lines.push(`DELETE FROM teams WHERE season_id = ${q(SEASON)};`);

lines.push(
  `INSERT INTO teams (id, season_id, name, slug, color) VALUES\n  ` +
    teams
      .map(
        (t) =>
          `(${q(t.id)}, ${q(SEASON)}, ${q(t.name)}, ${q(t.slug)}, ${q(t.color)})`,
      )
      .join(",\n  ") +
    ";",
);

lines.push(
  `INSERT INTO games (season_id, home_team_id, away_team_id, scheduled_at, kind, status) VALUES\n  ` +
    pairs
      .map(
        ([home, away], i) =>
          `(${q(SEASON)}, ${q(home)}, ${q(away)}, ${q(slots[i])}, 'regular', 'scheduled')`,
      )
      .join(",\n  ") +
    ";",
);

// Playoff stubs (TBD) so the bracket dates show on the schedule.
lines.push(
  `INSERT INTO games (season_id, home_team_id, away_team_id, scheduled_at, kind, status, playoff_round) VALUES\n  ` +
    [
      ["sf1", ps.sf1],
      ["sf2", ps.sf2],
      ["final", ps.final],
    ]
      .map(
        ([round, at]) =>
          `(${q(SEASON)}, NULL, NULL, ${q(at)}, 'playoff', 'scheduled', ${q(round)})`,
      )
      .join(",\n  ") +
    ";",
);

lines.push("COMMIT;");
console.log(lines.join("\n"));
