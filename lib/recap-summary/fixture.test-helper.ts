import type { RecapFacts } from "@/lib/recap-summary/facts";

// A small facts object for prompt/check tests.
export function facts(over: Partial<RecapFacts> = {}): RecapFacts {
  return {
    season: { name: "Spring 2026", start: "2026-03-01", end: "2026-05-17" },
    champion: "Ember Wolves",
    standings: [{ team: "Ember Wolves", record: "3-4-1", pts: 10, gf: 23, ga: 23 }],
    historicalStandings: null,
    regular: {
      numbers: null,
      leaders: { points: [], goals: [], assists: [], goalies: [{ player: "Sam Lund", team: "Ember Wolves", gaa: 2.5, gp: 8 }] },
      moments: ["Hat tricks · 2: Lane Kane ×2"],
    },
    playoffs: { games: [{ round: "final", away: "Ember Wolves", home: "Green Vipers", score: "2-1", winner: "Ember Wolves", decidedIn: "regulation" }], leaders: [], moments: [] },
    awards: [{ award: "MVP", winners: ["Lane Kane"] }],
    ...over,
  };
}
