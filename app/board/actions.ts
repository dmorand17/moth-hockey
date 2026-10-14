"use server";

import { revalidatePath } from "next/cache";
import { getBoardViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { postErrorMessage, validateBody } from "@/lib/board";

function revalidateBoard(gameId: string | null) {
  revalidatePath("/board");
  if (gameId) revalidatePath(`/games/${gameId}`);
}

// Writes go through the request client, so RLS enforces the same rules the
// checks below report; the triggers enforce threading and the rate limit.
export async function createPost(input: {
  body: string;
  gameId?: string | null;
  parentId?: string | null;
}): Promise<ActionResult> {
  const viewer = await getBoardViewer();
  if (!viewer) return fail("Not signed in.");
  if (!viewer.isLinked) return fail("Only linked players can post.");
  const valid = validateBody(input.body);
  if (!valid.ok) return fail(valid.error);

  const gameId = input.gameId ?? null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("posts").insert({
    author_id: viewer.userId,
    game_id: gameId,
    parent_id: input.parentId ?? null,
    body: valid.body,
  });
  if (error) return fail(postErrorMessage(error));
  revalidateBoard(gameId);
  return ok(input.parentId ? "Reply posted" : "Posted");
}

export async function editPost(input: { id: string; body: string }): Promise<ActionResult> {
  const viewer = await getBoardViewer();
  if (!viewer) return fail("Not signed in.");
  const valid = validateBody(input.body);
  if (!valid.ok) return fail(valid.error);

  const supabase = await createSupabaseServerClient();
  const { data: post } = await supabase.from("posts").select("author_id, game_id").eq("id", input.id).maybeSingle();
  if (!post) return fail("Post not found.");
  if (post.author_id !== viewer.userId && !viewer.isAdmin) return fail("You can only edit your own posts.");

  const { data: updated, error } = await supabase.from("posts").update({ body: valid.body }).eq("id", input.id).select("id");
  if (error) return fail(postErrorMessage(error));
  if (!updated || updated.length === 0) return fail("Post not found.");
  revalidateBoard(post.game_id);
  return ok("Saved");
}

export async function deletePost(input: { id: string }): Promise<ActionResult> {
  const viewer = await getBoardViewer();
  if (!viewer) return fail("Not signed in.");
  if (!viewer.isAdmin) return fail("Admins only.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("posts").delete().eq("id", input.id).select("game_id");
  if (error) return fail(postErrorMessage(error));
  if (!data || data.length === 0) return fail("Post not found.");
  revalidateBoard(data[0].game_id);
  return ok("Deleted");
}
