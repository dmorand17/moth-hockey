import { describe, expect, test } from "bun:test";
import {
  BODY_MAX,
  buildThreads,
  formatRelative,
  postErrorMessage,
  validateBody,
  type AuthorRow,
  type PostRow,
} from "./board";

describe("validateBody", () => {
  test("trims and accepts normal text", () => {
    expect(validateBody("  hi there \n")).toEqual({ ok: true, body: "hi there" });
  });

  test("rejects empty and whitespace-only", () => {
    expect(validateBody("")).toEqual({ ok: false, error: "Post can't be empty." });
    expect(validateBody("   \n ")).toEqual({ ok: false, error: "Post can't be empty." });
  });

  test("accepts exactly BODY_MAX characters, rejects one more", () => {
    expect(validateBody("a".repeat(BODY_MAX)).ok).toBe(true);
    expect(validateBody("a".repeat(BODY_MAX + 1))).toEqual({
      ok: false,
      error: `Posts must be ${BODY_MAX} characters or fewer.`,
    });
  });

  test("length is measured after trimming", () => {
    expect(validateBody(`  ${"a".repeat(BODY_MAX)}  `).ok).toBe(true);
  });
});

describe("postErrorMessage", () => {
  test("maps trigger errors", () => {
    expect(postErrorMessage({ message: "posts_rate_limited" })).toBe(
      "You're posting too fast — try again in a minute.",
    );
    expect(postErrorMessage({ message: "posts_invalid_parent" })).toBe("That post can't be replied to.");
  });

  test("maps RLS violations", () => {
    expect(
      postErrorMessage({ code: "42501", message: 'new row violates row-level security policy for table "posts"' }),
    ).toBe("Only linked players can post.");
  });

  test("falls back to a generic message", () => {
    expect(postErrorMessage({ code: "XX000", message: "boom" })).toBe("Something went wrong — please try again.");
  });
});

describe("buildThreads", () => {
  const row = (over: Partial<PostRow>): PostRow => ({
    id: "p",
    author_id: "u1",
    game_id: null,
    parent_id: null,
    body: "b",
    created_at: "2026-10-14T12:00:00Z",
    edited_at: null,
    ...over,
  });
  const authors: AuthorRow[] = [{ id: "pl1", first_name: "Wayne", last_name: "Gretzky", user_id: "u1" }];

  test("attaches authors and replies (oldest first), keeping top-level order", () => {
    const top = [row({ id: "t2", created_at: "2026-10-14T13:00:00Z" }), row({ id: "t1" })];
    const replies = [
      row({ id: "r2", parent_id: "t1", created_at: "2026-10-14T12:10:00Z" }),
      row({ id: "r1", parent_id: "t1", created_at: "2026-10-14T12:05:00Z" }),
    ];
    const threads = buildThreads(top, replies, authors);
    expect(threads.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(threads[0].replies).toEqual([]);
    expect(threads[1].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(threads[1].author).toEqual({ playerId: "pl1", name: "Wayne Gretzky" });
    expect(threads[1].authorId).toBe("u1");
  });

  test("author is null when no linked player", () => {
    const [t] = buildThreads([row({ id: "t", author_id: "ghost" })], [], authors);
    expect(t.author).toBeNull();
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  test("buckets", () => {
    expect(formatRelative("2026-10-14T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-14T11:55:00Z", now)).toBe("5m ago");
    expect(formatRelative("2026-10-14T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelative("2026-10-12T12:00:00Z", now)).toBe("2d ago");
  });

  test("falls back to a date after 7 days", () => {
    expect(formatRelative("2026-10-01T18:00:00Z", now)).toBe("Thu, Oct 1");
  });
});
