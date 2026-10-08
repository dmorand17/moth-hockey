import type { ReactNode } from "react";

export type WriteUp = {
  kind: "preview" | "recap";
  headline: string;
  body: string;
  model: string;
  hidden: boolean;
  edited_at: string | null;
  input?: unknown;
};

// An AI-written preview or recap. `footer` sits under the text (e.g. the odds
// board); `admin` is where edit/hide controls go for admins.
export function WriteUpCard({ writeUp, footer, admin }: { writeUp: WriteUp; footer?: ReactNode; admin?: ReactNode }) {
  return (
    <article className={`panel p-4 sm:p-5 space-y-3 ${writeUp.hidden ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="chip">{writeUp.kind === "preview" ? "Game preview" : "Recap"}</span>
        {writeUp.hidden && <span className="chip">Hidden</span>}
      </div>
      <h3 className="font-display text-[24px] sm:text-[28px] tracking-[0.03em] leading-tight text-ink">
        {writeUp.headline}
      </h3>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-dim">
        {writeUp.body.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {footer}
      <p className="text-[12px] text-ink-faint">
        {writeUp.edited_at ? "Written with AI, edited by an admin." : "Written with AI from league stats."}
      </p>
      {admin}
    </article>
  );
}
