// Turns raw model output into a stored headline + body, or a reason it was
// rejected. Rejected output is logged and retried on the next cron run —
// never stored.

export type ParsedWriteUp =
  | { ok: true; headline: string; body: string }
  | { ok: false; reason: string };

const MIN_WORDS = 60;
const MAX_WORDS = 250;

function cleanHeadline(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^headline:\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/^["'""]+|["'""]+$/g, "")
    .trim();
}

export function parseWriteUp(text: string): ParsedWriteUp {
  const cleaned = text.replace(/^```[a-z]*\n?|```$/g, "").trim();
  if (!cleaned) return { ok: false, reason: "empty output" };

  const lines = cleaned.split("\n");
  const headline = cleanHeadline(lines[0]);
  const body = lines
    .slice(1)
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!headline) return { ok: false, reason: "missing headline" };
  if (headline.length > 120) return { ok: false, reason: "headline too long" };
  const count = body ? body.split(/\s+/).length : 0;
  if (count < MIN_WORDS || count > MAX_WORDS) {
    return { ok: false, reason: `body is ${count} words (want ${MIN_WORDS}-${MAX_WORDS})` };
  }
  return { ok: true, headline, body };
}
