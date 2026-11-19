import { PostBody } from "@/components/PostBody";

// The season summary text plus its provenance note.
export function RecapSummary({ markdown, editedAt }: { markdown: string; editedAt: string | null }) {
  return (
    <div className="panel p-4 md:p-5">
      <PostBody body={markdown} />
      <p className="mt-3 text-[13px] text-ink-faint">
        Written with AI from league stats{editedAt ? " · Edited by an admin" : ""}
      </p>
    </div>
  );
}
