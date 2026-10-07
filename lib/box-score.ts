// Box score stat lines from a game's lineup (game_appearances, i.e. the
// scorekeeper's check-in) and its events. Pure — the game page loads rows and
// calls this. Definitions match the player game log in app/players/[id].

export type Position = "forward" | "defense" | "goalie";

export type LineupPlayer = {
  playerId: string;
  name: string;
  jersey: number | null;
  teamId: string;
  position: Position;
  isSub: boolean;
};

export type BoxEvent = {
  type: "goal" | "penalty";
  // For a goal, the scoring team; for a penalty, the committing team.
  teamId: string;
  playerId: string | null;
  assist1Id: string | null;
  assist2Id: string | null;
  shotTakerId: string | null;
  shotResult: "goal" | "saved" | null;
};

export type SkaterLine = {
  playerId: string;
  name: string;
  jersey: number | null;
  isSub: boolean;
  g: number;
  a: number;
  pts: number;
  pen: number;
  ps: number;
  psg: number;
};

export type GoalieLine = {
  playerId: string;
  name: string;
  jersey: number | null;
  isSub: boolean;
  ga: number;
  psf: number;
  psv: number;
  result: "W" | "L" | "OTL" | null;
};

export type TeamBox = {
  teamId: string;
  skaters: SkaterLine[];
  goalies: GoalieLine[];
  totals: { g: number; a: number; pts: number; pen: number; ps: number; psg: number };
};

export type FinalInfo = {
  homeScore: number;
  awayScore: number;
  decidedIn: "regulation" | "ot" | "shootout" | null;
};

function skaterLine(p: LineupPlayer, events: BoxEvent[]): SkaterLine {
  let g = 0, a = 0, pen = 0, ps = 0, psg = 0;
  for (const e of events) {
    if (e.type === "goal") {
      if (e.playerId === p.playerId) g++;
      if (e.assist1Id === p.playerId || e.assist2Id === p.playerId) a++;
    } else {
      if (e.playerId === p.playerId) pen++;
      if (e.shotTakerId === p.playerId) {
        ps++;
        if (e.shotResult === "goal") psg++;
      }
    }
  }
  return { playerId: p.playerId, name: p.name, jersey: p.jersey, isSub: p.isSub, g, a, pts: g + a, pen, ps, psg };
}

function goalieLine(p: LineupPlayer, events: BoxEvent[], result: GoalieLine["result"]): GoalieLine {
  let ga = 0, psf = 0, psv = 0;
  for (const e of events) {
    if (e.type === "goal" && e.teamId !== p.teamId) ga++;
    // A penalty committed by the goalie's own team puts a shooter on them.
    if (e.type === "penalty" && e.teamId === p.teamId) {
      psf++;
      if (e.shotResult === "saved") psv++;
      else if (e.shotResult === "goal") ga++;
    }
  }
  return { playerId: p.playerId, name: p.name, jersey: p.jersey, isSub: p.isSub, ga, psf, psv, result };
}

function teamResult(teamId: string, homeTeamId: string, final: FinalInfo | null): GoalieLine["result"] {
  if (!final) return null;
  const isHome = teamId === homeTeamId;
  const mine = isHome ? final.homeScore : final.awayScore;
  const theirs = isHome ? final.awayScore : final.homeScore;
  if (mine > theirs) return "W";
  return final.decidedIn === "ot" || final.decidedIn === "shootout" ? "OTL" : "L";
}

function teamBox(teamId: string, input: Parameters<typeof buildBoxScore>[0]): TeamBox {
  const players = input.lineup.filter((p) => p.teamId === teamId);
  const result = teamResult(teamId, input.homeTeamId, input.final);
  const skaters = players
    .filter((p) => p.position !== "goalie")
    .map((p) => skaterLine(p, input.events))
    .sort((x, y) => y.pts - x.pts || y.g - x.g || x.name.localeCompare(y.name));
  const goalies = players
    .filter((p) => p.position === "goalie")
    .map((p) => goalieLine(p, input.events, result));
  const totals = skaters.reduce(
    (t, s) => ({ g: t.g + s.g, a: t.a + s.a, pts: t.pts + s.pts, pen: t.pen + s.pen, ps: t.ps + s.ps, psg: t.psg + s.psg }),
    { g: 0, a: 0, pts: 0, pen: 0, ps: 0, psg: 0 },
  );
  return { teamId, skaters, goalies, totals };
}

export function buildBoxScore(input: {
  lineup: LineupPlayer[];
  events: BoxEvent[];
  homeTeamId: string;
  awayTeamId: string;
  final: FinalInfo | null;
}): { home: TeamBox; away: TeamBox } {
  return { home: teamBox(input.homeTeamId, input), away: teamBox(input.awayTeamId, input) };
}
