"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PostBody } from "@/components/PostBody";
import { RecapSummary } from "@/components/recap/RecapSummary";
import type { ActionResult } from "@/lib/action-result";
import type { RecapSummaryRow } from "@/lib/queries";
import { summaryActions } from "@/lib/recap-summary/admin";
import { numbersNotInFacts } from "@/lib/recap-summary/check";
import {
  discardRecapDraft,
  generateRecapSummary,
  publishRecapSummary,
  saveRecapDraft,
  unpublishRecapSummary,
} from "@/app/seasons/[slug]/recap/summary-actions";

const btn =
  "min-h-11 px-3.5 text-[14px] font-semibold rounded-md border border-rule-strong bg-board-3 text-ink hover:bg-board-hover disabled:opacity-50";
const primary =
  "min-h-11 px-3.5 text-[14px] font-semibold rounded-md border border-ice bg-ice text-board hover:opacity-90 disabled:opacity-50";

// Admin controls for the season summary: generate, edit, publish. What the
// admin sees is the draft when there is one, else the published text.
export function SummaryAdmin({ slug, published, draft }: { slug: string; published: RecapSummaryRow | null; draft: RecapSummaryRow | null }) {
  const current = draft ?? published;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(current?.markdown ?? "");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const run = (label: string, fn: () => Promise<ActionResult>, after?: () => void) => {
    setBusy(label);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        after?.();
        router.refresh();
      }
    });
  };

  const live = !!published?.published;
  const status = draft
    ? live
      ? "Unpublished changes — the league still sees the published version."
      : "Draft — not visible to the league."
    : published && !live
      ? "Unpublished — not visible to the league."
      : null;
  const unknown = current ? numbersNotInFacts(editing ? text : current.markdown, current.input) : [];
  const actions = summaryActions({ hasDraft: !!draft, hasPublished: !!published, live });
  const generate = () => {
    if (draft?.edited_at && !window.confirm("Regenerating replaces your edited draft. Continue?")) return;
    run("generate", () => generateRecapSummary({ slug }), () => setEditing(false));
  };

  if (!current) {
    return (
      <div className="panel-bare p-4 space-y-3">
        <p className="text-[14px] text-ink-dim">No season summary yet. The AI writes a draft from the stats on this page; you can edit it before anyone sees it.</p>
        <button type="button" className={primary} disabled={pending} onClick={generate}>
          {busy === "generate" ? "Writing…" : "Generate summary"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {status && <p className="panel-bare px-3 py-2 text-[14px] font-semibold text-gold">{status}</p>}

      {editing ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Season summary (markdown)"
            rows={16}
            className="w-full bg-board-2 border border-rule-strong rounded-md p-3 text-[15px] leading-relaxed text-ink"
          />
          <div className="panel p-4" aria-label="Preview">
            <PostBody body={text} />
          </div>
        </div>
      ) : (
        <RecapSummary markdown={current.markdown} editedAt={current.edited_at} collapsible={false} />
      )}

      {unknown.length > 0 && (
        <p role="status" className="text-[14px] text-gold">
          Not found in the stats: {unknown.join(", ")}. Check these before publishing.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <button type="button" className={primary} disabled={pending} onClick={() => run("save", () => saveRecapDraft({ slug, markdown: text }), () => setEditing(false))}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button type="button" className={btn} disabled={pending} onClick={() => { setText(current.markdown); setEditing(false); }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {actions.includes("publish") && (
              <button type="button" className={primary} disabled={pending} onClick={() => run("publish", () => publishRecapSummary({ slug }))}>
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            )}
            <button type="button" className={btn} disabled={pending} onClick={() => { setText(current.markdown); setEditing(true); }}>
              Edit
            </button>
            <button type="button" className={btn} disabled={pending} onClick={generate}>
              {busy === "generate" ? "Writing…" : "Regenerate"}
            </button>
            {actions.includes("discard") && (
              <button
                type="button"
                className={btn}
                disabled={pending}
                onClick={() => window.confirm("Discard this draft?") && run("discard", () => discardRecapDraft({ slug }))}
              >
                {busy === "discard" ? "Discarding…" : "Discard draft"}
              </button>
            )}
            {actions.includes("unpublish") && (
              <button type="button" className={btn} disabled={pending} onClick={() => run("unpublish", () => unpublishRecapSummary({ slug }))}>
                {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
              </button>
            )}
          </>
        )}
      </div>
      <p className="text-[13px] text-ink-faint">Model: {current.model}</p>
    </div>
  );
}
