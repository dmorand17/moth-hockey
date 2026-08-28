import { buildScheduledAt } from "./schedule-config";

/**
 * Round-robin pairings using the circle method.
 * Returns an array of [homeId, awayId] tuples covering `rounds` full
 * round-robins (each pair plays `rounds` times). Home/away is alternated
 * across rounds so each pair gets a balanced split.
 */
export function roundRobinPairs(
  teamIds: string[],
  rounds: number,
): Array<[string, string]> {
  if (teamIds.length < 2 || rounds < 1) return [];

  const ids = [...teamIds];
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push("__BYE__");

  const n = ids.length;
  const halfRounds: Array<Array<[string, string]>> = [];

  // Fix first team, rotate the rest. n-1 rounds make a single round-robin.
  const rotating = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = [];
    const order = [ids[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") {
        round.push([a, b]);
      }
    }
    halfRounds.push(round);
    // Rotate
    rotating.unshift(rotating.pop()!);
  }

  // Repeat for the requested number of full round-robins, swapping home/away
  // on alternating round-robin passes for balance.
  const out: Array<[string, string]> = [];
  for (let pass = 0; pass < rounds; pass++) {
    for (const round of halfRounds) {
      for (const [a, b] of round) {
        out.push(pass % 2 === 0 ? [a, b] : [b, a]);
      }
    }
  }

  return out;
}

/**
 * Round-robin pairings filled to exactly `count` games. Cycles through the base
 * round-robin sequence, alternating home/away on each full pass so repeated
 * matchups stay balanced. Used to fill an exact number of weekly game slots
 * (e.g. weeks × slots-per-night) regardless of how many games a single
 * round-robin covers.
 */
export function roundRobinGames(
  teamIds: string[],
  count: number,
): Array<[string, string]> {
  if (teamIds.length < 2 || count <= 0) return [];
  const base = roundRobinPairs(teamIds, 1);
  if (base.length === 0) return [];

  const out: Array<[string, string]> = [];
  let idx = 0;
  let pass = 0;
  while (out.length < count) {
    if (idx >= base.length) {
      idx = 0;
      pass++;
    }
    const [a, b] = base[idx++];
    out.push(pass % 2 === 0 ? [a, b] : [b, a]);
  }
  return out;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export type WeekdayIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function weekdayLabel(idx: WeekdayIdx): string {
  return WEEKDAY_NAMES[idx];
}

/**
 * Walk forward from `startDate` to the first occurrence of `weekday`, then
 * fill `times` slots in order, advancing 7 days when slots run out. Returns
 * `count` ISO timestamps suitable for `games.scheduled_at`.
 */
export function buildGameSlots(
  startDate: string, // "YYYY-MM-DD"
  weekday: WeekdayIdx,
  times: string[], // "HH:mm" entries
  count: number,
): string[] {
  if (count <= 0 || times.length === 0) return [];

  // Parse YYYY-MM-DD as a local date (avoid TZ shift from new Date(string))
  const [y, m, d] = startDate.split("-").map(Number);
  const cursor = new Date(y, (m ?? 1) - 1, d ?? 1);

  // Advance to the first matching weekday (inclusive of startDate itself).
  while (cursor.getDay() !== weekday) {
    cursor.setDate(cursor.getDate() + 1);
  }

  const out: string[] = [];
  let slotIdx = 0;
  while (out.length < count) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    out.push(buildScheduledAt(`${yyyy}-${mm}-${dd}`, times[slotIdx]));
    slotIdx++;
    if (slotIdx >= times.length) {
      slotIdx = 0;
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  return out;
}


export type PlayoffRound = "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final";

/** Playoff games in bracket order (round 1 first … Final last) for R rounds. */
export function playoffRoundsFor(rounds: number): PlayoffRound[] {
  if (rounds === 1) return ["final"];
  if (rounds === 2) return ["sf1", "sf2", "final"];
  if (rounds === 3) return ["qf1", "qf2", "qf3", "qf4", "sf1", "sf2", "final"];
  return [];
}

/** Round-1 seed pairings (1-indexed) for R rounds, in the same order as the
 *  first N entries of playoffRoundsFor(rounds). */
export function firstRoundSeeds(rounds: number): [number, number][] {
  if (rounds === 1) return [[1, 2]];
  if (rounds === 2) return [[1, 4], [2, 3]];
  if (rounds === 3) return [[1, 8], [4, 5], [3, 6], [2, 7]];
  return [];
}

/** Which two earlier games feed each later game. */
export function playoffFeeders(
  rounds: number,
): Partial<Record<PlayoffRound, [PlayoffRound, PlayoffRound]>> {
  if (rounds === 2) return { final: ["sf1", "sf2"] };
  if (rounds === 3)
    return { sf1: ["qf1", "qf2"], sf2: ["qf3", "qf4"], final: ["sf1", "sf2"] };
  return {};
}

export function playoffLabel(r: PlayoffRound): string {
  return r === "final" ? "Final" : r.toUpperCase();
}

/** ISO timestamps for `playoffCount` playoff games, laid into the weekly grid
 *  right after the regular season (bracket order). */
export function playoffSlots(
  startDate: string,
  weekday: WeekdayIdx,
  times: string[],
  regularCount: number,
  playoffCount: number,
): string[] {
  if (times.length === 0 || playoffCount <= 0) return [];
  const slots = buildGameSlots(startDate, weekday, times, regularCount + playoffCount);
  return slots.slice(regularCount);
}

/** "YYYY-MM-DD" in local time — a stable per-game-night key. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Bye teams per game night: for each date that has regular-season games, the
 * teams NOT playing that night. Derived, so it stays correct as weeks shift.
 * Returns only dates that have at least one bye (even team counts → empty).
 */
export function byeTeamNamesByDate(
  teams: { id: string; name: string }[],
  regularGames: { localDate: string; homeTeamId: string | null; awayTeamId: string | null }[],
): Record<string, string[]> {
  const playingByDate = new Map<string, Set<string>>();
  for (const g of regularGames) {
    const set = playingByDate.get(g.localDate) ?? new Set<string>();
    if (g.homeTeamId) set.add(g.homeTeamId);
    if (g.awayTeamId) set.add(g.awayTeamId);
    playingByDate.set(g.localDate, set);
  }

  const out: Record<string, string[]> = {};
  for (const [date, playing] of playingByDate) {
    const byes = teams.filter((t) => !playing.has(t.id)).map((t) => t.name);
    if (byes.length > 0) out[date] = byes;
  }
  return out;
}
