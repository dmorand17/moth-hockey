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
    <article className={`panel p-4 md:p-6 space-y-3 ${writeUp.hidden ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{writeUp.kind === "preview" ? "Game preview" : "Recap"}</span>
        {writeUp.hidden && <span className="chip">Hidden</span>}
      </div>
      <h2 className="font-display text-[26px] leading-[30px] md:text-[32px] md:leading-[36px] tracking-[0.02em] text-ink max-w-[30ch]">
        {writeUp.headline}
      </h2>
      <div className="space-y-3 text-[16px] leading-[1.65] text-ink-dim max-w-[75ch] lg:max-w-none lg:columns-2 lg:gap-10 lg:[&>p]:break-inside-avoid">
        {writeUp.body.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {footer}
      <p className="text-[13px] text-ink-faint">
        {writeUp.edited_at ? "Written with AI, edited by an admin." : "Written with AI from league stats."}
      </p>
      {admin}
    </article>
  );
}
