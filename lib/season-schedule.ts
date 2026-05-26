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

