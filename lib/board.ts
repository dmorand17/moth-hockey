import { formatDate } from "./format";

export const BODY_MAX = 2000;

export type PostRow = {
  id: string;
  author_id: string;
  game_id: string | null;
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type AuthorRow = { id: string; first_name: string; last_name: string; user_id: string | null };

export type Post = {
  id: string;
  authorId: string;
  author: { playerId: string; name: string } | null;
  gameId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

export type Thread = Post & { replies: Post[] };

export function validateBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Post can't be empty." };
  if (body.length > BODY_MAX) return { ok: false, error: `Posts must be ${BODY_MAX} characters or fewer.` };
  return { ok: true, body };
}

// Maps Postgres errors from the posts triggers / RLS to user-facing text.
export function postErrorMessage(err: { code?: string; message: string }): string {
  if (err.message.includes("posts_rate_limited")) return "You're posting too fast — try again in a minute.";
  if (err.message.includes("posts_invalid_parent")) return "That post can't be replied to.";
  if (err.code === "42501") return "Only linked players can post.";
  return "Something went wrong — please try again.";
}

export function buildThreads(top: PostRow[], replies: PostRow[], authors: AuthorRow[]): Thread[] {
  const byUser = new Map(
    authors.filter((a) => a.user_id).map((a) => [a.user_id!, { playerId: a.id, name: `${a.first_name} ${a.last_name}` }]),
  );
  const toPost = (r: PostRow): Post => ({
    id: r.id,
    authorId: r.author_id,
    author: byUser.get(r.author_id) ?? null,
    gameId: r.game_id,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  });
  const sortedReplies = [...replies].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return top.map((t) => ({
    ...toPost(t),
    replies: sortedReplies.filter((r) => r.parent_id === t.id).map(toPost),
  }));
}

export function parseCursor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  // Strict ISO-8601 timestamp regex: YYYY-MM-DDTHH:MM:SS[.ffffff][Z|±HH:MM]
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

  if (!iso8601Regex.test(raw)) return undefined;

  // Ensure Date.parse succeeds (strict validation)
  if (Number.isNaN(Date.parse(raw))) return undefined;

  return raw;
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const secs = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(iso);
}
