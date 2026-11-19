import { PostBody } from "@/components/PostBody";
import { ReadMore } from "@/components/recap/ReadMore";

// The season summary text plus its provenance note. Long reports start
// collapsed to a preview; the admin editor shows them in full.
export function RecapSummary({ markdown, editedAt, collapsible = true }: { markdown: string; editedAt: string | null; collapsible?: boolean }) {
  return (
    <div className="panel p-4 md:p-5">
      {collapsible ? (
        <ReadMore>
          <PostBody body={markdown} />
        </ReadMore>
      ) : (
        <PostBody body={markdown} />
      )}
      <p className="mt-3 text-[13px] text-ink-faint">
        Written with AI from league stats{editedAt ? " · Edited by an admin" : ""}
      </p>
    </div>
  );
}
