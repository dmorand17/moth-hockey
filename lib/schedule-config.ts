export type GameTime = { label: string; value: string };

/** Common ice time slots. Edit this list to change available quick-select options. */
export const COMMON_GAME_TIMES: GameTime[] = [
  { label: "8:20 PM", value: "20:20" },
  { label: "9:30 PM", value: "21:30" },
];

/** Combine "YYYY-MM-DD" + "HH:mm" (interpreted as local time) and return a UTC ISO string. */
export function buildScheduledAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}
