// Structured logs: one JSON line per event, so Vercel's log search can filter
// on the event name or any field (e.g. "ai.call", "season-summary", "gen-…").
// Never pass prompts, outputs, keys or personal data here — sizes and IDs only.
export function logEvent(event: string, data: Record<string, unknown>, level: "info" | "warn" | "error" = "info"): void {
  console[level](JSON.stringify({ event, ...data }));
}
