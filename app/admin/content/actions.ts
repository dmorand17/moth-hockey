"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Section = "rules" | "faq" | "league";

function back(qs: string): never {
  redirect(`/admin/content?${qs}`);
}

function parseSection(raw: string): Section | null {
  if (raw === "rules" || raw === "faq" || raw === "league") return raw;
  return null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSortOrder(raw: string): number {
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

export async function createContentPage(formData: FormData) {
  await requireRole(["admin"]);

  const section = parseSection(String(formData.get("section") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const body = String(formData.get("body_md") ?? "");
  const sortOrder = parseSortOrder(String(formData.get("sort_order") ?? "0"));

  if (!section || !title) back("error=invalid_input");

  const slug = slugify(slugRaw || title);
  if (!slug) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("content_pages").insert({
    section,
    slug,
    title,
    body_md: body,
    sort_order: sortOrder,
  });

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/content");
  revalidatePath(`/about/${section}`);
  redirect("/admin/content?saved=created");
}

export async function updateContentPage(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const section = parseSection(String(formData.get("section") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const body = String(formData.get("body_md") ?? "");
  const sortOrder = parseSortOrder(String(formData.get("sort_order") ?? "0"));

  if (!id || !section || !title) back("error=invalid_input");

  const slug = slugify(slugRaw || title);
  if (!slug) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("content_pages")
    .update({ section, slug, title, body_md: body, sort_order: sortOrder })
    .eq("id", id);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/content");
  revalidatePath(`/about/${section}`);
  redirect("/admin/content?saved=updated");
}

export async function deleteContentPage(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const section = parseSection(String(formData.get("section") ?? ""));
  if (!id) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("content_pages").delete().eq("id", id);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/content");
  if (section) revalidatePath(`/about/${section}`);
  redirect("/admin/content?saved=deleted");
}
