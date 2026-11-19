// Which controls the admin sees on the season summary, by state. A pending
// draft never blocks Unpublish, and a draft can always be thrown away.
export type SummaryAction = "generate" | "publish" | "edit" | "regenerate" | "discard" | "unpublish";

export function summaryActions(s: { hasDraft: boolean; hasPublished: boolean; live: boolean }): SummaryAction[] {
  if (!s.hasDraft && !s.hasPublished) return ["generate"];
  const out: SummaryAction[] = [];
  if (s.hasDraft || !s.live) out.push("publish");
  out.push("edit", "regenerate");
  if (s.hasDraft) out.push("discard");
  if (s.live) out.push("unpublish");
  return out;
}
