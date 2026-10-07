"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WriteUp } from "@/components/WriteUpCard";
import { regenerateWriteUp, setWriteUpHidden, updateWriteUp } from "@/app/games/[id]/write-up-actions";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

export function WriteUpAdminControls({
  gameId,
  writeUp,
  canRegenerate,
}: {
  gameId: string;
  writeUp: WriteUp;
  canRegenerate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(writeUp.headline);
  const [body, setBody] = useState(writeUp.body);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        after?.();
        router.refresh();
      }
    });

  if (editing) {
    return (
      <div className="space-y-2 border-t border-rule pt-3">
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          aria-label="Headline"
          className="w-full min-h-[40px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[15px] text-ink"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Body"
          rows={8}
          className="w-full bg-board-2 border border-rule-strong rounded-[2px] p-2 text-[14px] leading-relaxed text-ink"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            className={btn}
            onClick={() => run(() => updateWriteUp({ gameId, kind: writeUp.kind, headline, body }), () => setEditing(false))}
          >
            Save
          </button>
          <button
            type="button"
            disabled={pending}
            className={btn}
            onClick={() => {
              setHeadline(writeUp.headline);
              setBody(writeUp.body);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
      <button
        type="button"
        disabled={pending}
        className={btn}
        onClick={() => {
          setHeadline(writeUp.headline);
          setBody(writeUp.body);
          setEditing(true);
        }}
      >
        Edit
      </button>
      <button
        type="button"
        disabled={pending}
        className={btn}
        onClick={() => run(() => setWriteUpHidden({ gameId, kind: writeUp.kind, hidden: !writeUp.hidden }))}
      >
        {writeUp.hidden ? "Show" : "Hide"}
      </button>
      {canRegenerate && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => {
            if (!confirm("Replace this write-up with a new one? Any edits will be lost.")) return;
            run(() => regenerateWriteUp({ gameId, kind: writeUp.kind }));
          }}
        >
          {pending ? "Working…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}
