"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WriteUp } from "@/components/WriteUpCard";
import { generateWriteUp, regenerateWriteUp, setWriteUpHidden, updateWriteUp } from "@/app/games/[id]/write-up-actions";

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
    <div className="space-y-3 border-t border-rule pt-3">
      <div className="flex flex-wrap gap-2">
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
      <details className="panel p-3">
        <summary className="min-h-9 flex items-center cursor-pointer text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-dim select-none">
          View AI input
        </summary>
        <div className="mt-3">
          {writeUp.input != null ? (
            <pre className="max-h-96 overflow-auto text-[12px] tnum text-ink-dim whitespace-pre-wrap break-words">
              {JSON.stringify(writeUp.input, null, 2)}
            </pre>
          ) : (
            <p className="text-[13px] text-ink-dim">No AI input stored (generated before inputs were saved).</p>
          )}
        </div>
      </details>
    </div>
  );
}

// Shown to admins in place of the write-up card when a game has none yet.
export function GenerateWriteUpButton({ gameId, kind }: { gameId: string; kind: WriteUp["kind"] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[14px] text-ink-dim">No {kind} yet.</p>
      <button
        type="button"
        disabled={pending}
        className={btn}
        onClick={() =>
          startTransition(async () => {
            const res = await generateWriteUp({ gameId, kind });
            if (!res.ok) toast.error(res.error);
            else {
              toast.success(res.message ?? "Generated");
              router.refresh();
            }
          })
        }
      >
        {pending ? "Generating…" : `Generate ${kind}`}
      </button>
    </div>
  );
}
