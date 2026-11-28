/** The league plays in US Eastern. All game times are wall-clock in this zone. */
export const LEAGUE_TIME_ZONE = "America/New_York";

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zoneParts(date: Date, timeZone: string): ZoneParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` at `instant`, in milliseconds. East of UTC is positive. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zoneParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock `YYYY-MM-DD` + `HH:mm` (or `HH:mm:ss`) in `timeZone`
 * to a UTC `Date`. DST is resolved from the IANA zone data.
 */
export function zonedLocalToUtc(
  date: string,
  time: string,
  timeZone: string = LEAGUE_TIME_ZONE,
): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, se] = time.split(":").map(Number);
  const guess = Date.UTC(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, se ?? 0);
  const offset1 = timeZoneOffsetMs(new Date(guess), timeZone);
  const utc = guess - offset1;
  const offset2 = timeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(offset1 === offset2 ? utc : guess - offset2);
}

/** Combine a league-local date and time into a UTC ISO string for `games.scheduled_at`. */
export function buildScheduledAt(date: string, time: string): string {
  return zonedLocalToUtc(date, time).toISOString();
}

/** `YYYY-MM-DD` of an instant in the league timezone. */
export function leagueDateKey(iso: string): string {
  const p = zoneParts(new Date(iso), LEAGUE_TIME_ZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** `HH:mm` of an instant in the league timezone. */
export function leagueTimeOfDay(iso: string): string {
  const p = zoneParts(new Date(iso), LEAGUE_TIME_ZONE);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Midnight at the start of a league-local `YYYY-MM-DD`, as a UTC ISO string. */
export function startOfLeagueDay(date: string): string {
  return buildScheduledAt(date, "00:00");
}

/** Day of week (0 = Sunday) of an instant in the league timezone. */
export function leagueWeekday(iso: string): number {
  const [y, m, d] = leagueDateKey(iso).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0)).getUTCDay();
}

/**
 * Move an instant by whole weeks, keeping its league-local wall-clock time
 * (so a 8:20 PM game stays 8:20 PM across a DST change).
 */
export function shiftLeagueWeeks(iso: string, weeks: number): string {
  const [y, m, d] = leagueDateKey(iso).split("-").map(Number);
  const day = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + weeks * 7));
  return buildScheduledAt(day.toISOString().slice(0, 10), leagueTimeOfDay(iso));
}
