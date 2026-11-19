"use server";

import { revalidatePath } from "next/cache";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getAuthSession } from "@/lib/auth";
import { MEDIA_TYPES, maxBytesFor, mediaPrefix, moveItem, validateMediaUrl } from "@/lib/media";
import { getRecapSeasons } from "@/lib/queries";
import { seasonSlug } from "@/lib/seasons";
import { deleteBlob, headBlob } from "@/lib/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CAPTION = 300;

// Writes go through the request client, so RLS ("admins manage season media")
// enforces the same rule this check reports.
async function adminOnly() {
  const session = await getAuthSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (session.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, session, supabase: await createSupabaseServerClient() };
}

async function seasonIdFor(slug: string): Promise<string | null> {
  return (await getRecapSeasons()).find((s) => seasonSlug(s.name) === slug)?.id ?? null;
}

const done = (slug: string, message: string) => {
  revalidatePath(`/seasons/${slug}/recap`);
  return ok(message);
};

// Called by the browser after a direct-to-Blob upload finishes. Re-checks the
// URL and reads the blob's real size/type before recording it.
export async function recordSeasonMedia(input: {
  slug: string;
  url: string;
  width: number | null;
  height: number | null;
  caption?: string;
}): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const seasonId = await seasonIdFor(input.slug);
  if (!seasonId) return fail("Season not found.");

  const url = validateMediaUrl(input.url, mediaPrefix(input.slug, process.env.VERCEL_ENV));
  if (!url.ok) return fail(url.error);
  const blob = await headBlob(input.url);
  if (!blob) return fail("Upload not found in storage.");
  if (!MEDIA_TYPES.includes(blob.contentType)) return fail(`${blob.contentType} files aren't allowed.`);
  if (blob.size > maxBytesFor(blob.contentType)) return fail("File is too large.");

  const db = auth.supabase;
  const { data: last } = await db
    .from("season_media")
    .select("sort_order")
    .eq("season_id", seasonId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dim = (n: number | null) => (n && Number.isInteger(n) && n > 0 ? n : null);
  const { error } = await db.from("season_media").insert({
    season_id: seasonId,
    blob_url: input.url,
    pathname: url.pathname,
    content_type: blob.contentType,
    size_bytes: blob.size,
    width: dim(input.width),
    height: dim(input.height),
    caption: (input.caption ?? "").trim().slice(0, MAX_CAPTION),
    uploaded_by: auth.session.userId,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return fail(error.message);
  return done(input.slug, "Added");
}

export async function updateMediaCaption({ slug, id, caption }: { slug: string; id: string; caption: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const text = caption.trim();
  if (text.length > MAX_CAPTION) return fail(`Keep captions under ${MAX_CAPTION} characters.`);
  const { error } = await auth.supabase.from("season_media").update({ caption: text }).eq("id", id);
  if (error) return fail(error.message);
  return done(slug, "Caption saved");
}

export async function moveSeasonMedia({ slug, id, dir }: { slug: string; id: string; dir: -1 | 1 }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const seasonId = await seasonIdFor(slug);
  if (!seasonId) return fail("Season not found.");
  const db = auth.supabase;
  const { data, error } = await db
    .from("season_media")
    .select("id, sort_order")
    .eq("season_id", seasonId)
    .order("sort_order")
    .order("created_at");
  if (error) return fail(error.message);
  const moved = moveItem(data, id, dir);
  const changed = moved.map((m, i) => ({ id: m.id, sort_order: i })).filter((m, i) => data[i].id !== m.id || data[i].sort_order !== i);
  for (const m of changed) {
    const { error: e } = await db.from("season_media").update({ sort_order: m.sort_order }).eq("id", m.id);
    if (e) return fail(e.message);
  }
  return done(slug, "Moved");
}

// Removes the file first, then the record; a file that's already gone is fine.
export async function deleteSeasonMedia({ slug, id }: { slug: string; id: string }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const db = auth.supabase;
  const { data: row, error } = await db.from("season_media").select("blob_url").eq("id", id).maybeSingle();
  if (error) return fail(error.message);
  if (!row) return fail("Already removed.");
  try {
    await deleteBlob(row.blob_url);
  } catch (e) {
    console.error("media blob delete failed", e);
    return fail("Couldn't delete the file from storage. Try again.");
  }
  const { error: delError } = await db.from("season_media").delete().eq("id", id);
  if (delError) return fail(delError.message);
  return done(slug, "Deleted");
}
