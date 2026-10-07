"use server";

import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { generateAndStore } from "@/lib/write-ups/generate";

type Kind = "preview" | "recap";

// Edits go through the request client, so RLS ("admins manage write-ups")
// enforces the same rule the check below reports.
async function adminOnly() {
  const session = await getAuthSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (session.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, session, supabase: await createSupabaseServerClient() };
}

export async function updateWriteUp(input: {
  gameId: string;
  kind: Kind;
  headline: string;
  body: string;
}): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const headline = input.headline.trim();
  const body = input.body.trim();
  if (!headline || !body) return fail("Headline and body are required.");

  const { error } = await auth.supabase
    .from("game_write_ups")
    .update({ headline, body, edited_at: new Date().toISOString(), edited_by: auth.session.userId })
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);
  revalidatePath(`/games/${input.gameId}`);
  return ok("Saved");
}

export async function setWriteUpHidden(input: { gameId: string; kind: Kind; hidden: boolean }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const { error } = await auth.supabase
    .from("game_write_ups")
    .update({ hidden: input.hidden })
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);
  revalidatePath(`/games/${input.gameId}`);
  return ok(input.hidden ? "Hidden" : "Visible");
}

// Discards the current text (including edits) and writes a fresh one. Refuses
// when the game is no longer in the right state, so a click can't delete a
// preview for a game that has already started and leave nothing behind.
export async function regenerateWriteUp(input: { gameId: string; kind: Kind }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);

  const { data: game } = await auth.supabase.from("games").select("status").eq("id", input.gameId).maybeSingle();
  const wanted = input.kind === "preview" ? "scheduled" : "final";
  if (game?.status !== wanted) return fail(`A ${input.kind} can only be regenerated for a ${wanted} game.`);

  const { error } = await auth.supabase
    .from("game_write_ups")
    .delete()
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);

  const result = await generateAndStore(input.kind, input.gameId);
  revalidatePath(`/games/${input.gameId}`);
  if (result.status !== "created") {
    return fail(`Couldn't regenerate (${result.detail ?? result.status}). The next daily run will try again.`);
  }
  return ok("Regenerated");
}
