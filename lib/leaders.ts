// Scoring-leader aggregation for the current season (pure; no DB access).

type PlayerRef = { id: string; first_name: string; last_name: string } | null;
type TeamRef = { name: string; slug: string; color: string };

export type LeaderGoalEvent = {
  team_id: string; // team credited with the goal
  scorer: PlayerRef;
  assist1: PlayerRef;
  assist2: PlayerRef;
};

export type LeaderRosterEntry = { player_id: string; team_id: string; team: TeamRef | null };

export type ScoringLeader = {
  player_id: string;
  name: string;
  goals: number;
  assists: number;
  points: number;
  team: TeamRef | null;
};

// A scorer gets +1 goal, each assister +1 assist; points = goals + assists.
// Only points earned for the player's own roster team count, so goals and
// assists made while subbing for another team are left out (the same rule the
// stats page uses). Returns players with ≥1 point, sorted by points, then
// goals, then name.
export function aggregateScoringLeaders(events: LeaderGoalEvent[], roster: LeaderRosterEntry[]): ScoringLeader[] {
  const rosterByPlayer = new Map(roster.map((r) => [r.player_id, r]));
  const acc = new Map<string, ScoringLeader>();

  const bump = (p: PlayerRef, teamId: string, g: number, a: number) => {
    if (!p) return;
    const spot = rosterByPlayer.get(p.id);
    if (!spot || spot.team_id !== teamId) return;
    const cur = acc.get(p.id) ?? {
      player_id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      goals: 0,
      assists: 0,
      points: 0,
      team: spot.team,
    };
    cur.goals += g;
    cur.assists += a;
    cur.points = cur.goals + cur.assists;
    acc.set(p.id, cur);
  };

  for (const e of events) {
    bump(e.scorer, e.team_id, 1, 0);
    bump(e.assist1, e.team_id, 0, 1);
    bump(e.assist2, e.team_id, 0, 1);
  }

  return [...acc.values()].sort(
    (a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name),
  );
}
