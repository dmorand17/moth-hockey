"use server";

import { revalidatePath } from "next/cache";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getAuthSession } from "@/lib/auth";
import { getSeasonRecap } from "@/lib/queries";
import { numbersNotInFacts, parseRecapSummary } from "@/lib/recap-summary/check";
import { buildRecapFacts, computeRecap } from "@/lib/recap-summary/facts";
import { buildRecapPrompt, RECAP_SYSTEM } from "@/lib/recap-summary/prompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/write-ups/openrouter";

const MAX_CHARS = 12000;

// Writes go through the request client, so RLS ("admins manage recap…")
// enforces the same rule this check reports.
async function adminOnly() {
  const session = await getAuthSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (session.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, session, supabase: await createSupabaseServerClient() };
}

async function seasonIdFor(slug: string): Promise<string | null> {
  return (await getSeasonRecap(slug))?.season.id ?? null;
}

// Writes a fresh AI draft. Never touches the published summary.
export async function generateRecapSummary({ slug }: { slug: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const r = await getSeasonRecap(slug);
  if (!r) return fail("Season not found.");
  if (r.state !== "complete") return fail("Season isn't complete yet.");

  const facts = buildRecapFacts(r, computeRecap(r));
  let result;
  try {
    result = await generateText(RECAP_SYSTEM, buildRecapPrompt(facts), { maxTokens: 6000, timeoutMs: 75_000 });
  } catch (e) {
    console.error("recap summary generation failed", e);
    return fail("The AI didn't respond. Try again in a minute.");
  }
  const parsed = parseRecapSummary(result.text);
  if (!parsed.ok) {
    console.error("recap summary rejected:", parsed.reason);
    return fail(`The AI's draft was unusable (${parsed.reason}). Try again.`);
  }

  const { error } = await auth.supabase.from("season_recap_drafts").upsert({
    season_id: r.season.id,
    draft_markdown: parsed.markdown,
    input: facts,
    model: result.model,
    generated_at: new Date().toISOString(),
    edited_by: null,
    edited_at: null,
  });
  if (error) return fail(error.message);
  revalidatePath(`/seasons/${slug}/recap`);
  const unknown = numbersNotInFacts(parsed.markdown, facts);
  return ok(unknown.length ? `Draft ready — check: ${unknown.join(", ")}` : "Draft ready");
}

// Saves admin edits to the draft, starting one from the published summary if needed.
export async function saveRecapDraft({ slug, markdown }: { slug: string; markdown: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const text = markdown.trim();
  if (!text) return fail("The summary can't be empty.");
  if (text.length > MAX_CHARS) return fail(`Keep it under ${MAX_CHARS} characters.`);
  const seasonId = await seasonIdFor(slug);
  if (!seasonId) return fail("Season not found.");

  const db = auth.supabase;
  const [{ data: draft }, { data: pub }] = await Promise.all([
    db.from("season_recap_drafts").select("input, model, generated_at").eq("season_id", seasonId).maybeSingle(),
    db.from("season_recaps").select("input, model, generated_at").eq("season_id", seasonId).maybeSingle(),
  ]);
  const base = draft ?? pub;
  if (!base) return fail("Generate a summary first.");

  const { error } = await db.from("season_recap_drafts").upsert({
    season_id: seasonId,
    draft_markdown: text,
    input: base.input,
    model: base.model,
    generated_at: base.generated_at,
    edited_by: auth.session.userId,
    edited_at: new Date().toISOString(),
  });
  if (error) return fail(error.message);
  revalidatePath(`/seasons/${slug}/recap`);
  return ok("Draft saved");
}

// Copies the draft into the published record and clears the draft.
export async function publishRecapSummary({ slug }: { slug: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const seasonId = await seasonIdFor(slug);
  if (!seasonId) return fail("Season not found.");

  const db = auth.supabase;
  const { data: draft, error: readError } = await db.from("season_recap_drafts").select("*").eq("season_id", seasonId).maybeSingle();
  if (readError) return fail(readError.message);
  if (!draft) {
    // No pending edits: re-publish an unpublished summary as it stands.
    const { data, error: republishError } = await db
      .from("season_recaps")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("season_id", seasonId)
      .select("season_id");
    if (republishError) return fail(republishError.message);
    if (!data?.length) return fail("Nothing to publish.");
    revalidatePath(`/seasons/${slug}/recap`);
    return ok("Published");
  }

  const { error } = await db.from("season_recaps").upsert({
    season_id: seasonId,
    summary_markdown: draft.draft_markdown,
    input: draft.input,
    model: draft.model,
    generated_at: draft.generated_at,
    edited_by: draft.edited_by,
    edited_at: draft.edited_at,
    published: true,
    published_at: new Date().toISOString(),
  });
  if (error) return fail(error.message);
  const { error: delError } = await db.from("season_recap_drafts").delete().eq("season_id", seasonId);
  if (delError) return fail(delError.message);
  revalidatePath(`/seasons/${slug}/recap`);
  return ok("Published");
}

export async function unpublishRecapSummary({ slug }: { slug: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const seasonId = await seasonIdFor(slug);
  if (!seasonId) return fail("Season not found.");
  const { error } = await auth.supabase.from("season_recaps").update({ published: false }).eq("season_id", seasonId);
  if (error) return fail(error.message);
  revalidatePath(`/seasons/${slug}/recap`);
  return ok("Unpublished");
}

// Throws away the pending draft; the published summary (if any) is untouched.
export async function discardRecapDraft({ slug }: { slug: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const seasonId = await seasonIdFor(slug);
  if (!seasonId) return fail("Season not found.");
  const { error } = await auth.supabase.from("season_recap_drafts").delete().eq("season_id", seasonId);
  if (error) return fail(error.message);
  revalidatePath(`/seasons/${slug}/recap`);
  return ok("Draft discarded");
}
