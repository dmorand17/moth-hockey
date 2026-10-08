"use server";

import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { generateAndStore } from "@/lib/write-ups/generate";

type Kind = "preview" | "recap";

function isValidKind(kind: string): kind is Kind {
  return kind === "preview" || kind === "recap";
}

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
  if (!isValidKind(input.kind)) return fail("Invalid write-up type.");
  const headline = input.headline.trim();
  const body = input.body.trim();
  if (!headline || !body) return fail("Headline and body are required.");
  if (headline.length > 200) return fail("Headline must be 200 characters or fewer.");
  if (body.length > 5000) return fail("Body must be 5000 characters or fewer.");

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
  if (!isValidKind(input.kind)) return fail("Invalid write-up type.");
  const { error } = await auth.supabase
    .from("game_write_ups")
    .update({ hidden: input.hidden })
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);
  revalidatePath(`/games/${input.gameId}`);
  return ok(input.hidden ? "Hidden" : "Visible");
}

// Regenerates by calling the model first; only replaces the row after a successful
// generation. On failure the old row (including any admin edits) is preserved.
export async function regenerateWriteUp(input: { gameId: string; kind: Kind }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  if (!isValidKind(input.kind)) return fail("Invalid write-up type.");

  const { data: game } = await auth.supabase.from("games").select("status").eq("id", input.gameId).maybeSingle();
  const wanted = input.kind === "preview" ? "scheduled" : "final";
  if (game?.status !== wanted) return fail(`A ${input.kind} can only be regenerated for a ${wanted} game.`);

  const result = await generateAndStore(input.kind, input.gameId, { replace: true });
  revalidatePath(`/games/${input.gameId}`);
  if (result.status !== "created") {
    return fail(`Couldn't regenerate (${result.detail ?? result.status}). The current write-up was kept.`);
  }
  return ok("Regenerated");
}

// Generates a write-up for a game that doesn't have one yet (e.g. a final older
// than the cron's 7-day window). Never replaces an existing write-up.
export async function generateWriteUp(input: { gameId: string; kind: Kind }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  if (!isValidKind(input.kind)) return fail("Invalid write-up type.");

  const { data: game } = await auth.supabase.from("games").select("status").eq("id", input.gameId).maybeSingle();
  const wanted = input.kind === "preview" ? "scheduled" : "final";
  if (game?.status !== wanted) return fail(`A ${input.kind} can only be generated for a ${wanted} game.`);

  const result = await generateAndStore(input.kind, input.gameId);
  revalidatePath(`/games/${input.gameId}`);
  if (result.status === "exists") return fail(`This game already has a ${input.kind}.`);
  if (result.status !== "created") return fail(`Couldn't generate (${result.detail ?? result.status}).`);
  return ok("Generated");
}
