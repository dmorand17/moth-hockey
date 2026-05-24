import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Role = Database["public"]["Enums"]["user_role"];

export type AuthSession = {
  userId: string;
  email: string;
  role: Role | null;
};

// Loads the current auth session + role row. Returns null when signed out.
export async function getAuthSession(): Promise<AuthSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .single();

  return {
    userId: userData.user.id,
    email: userData.user.email ?? "",
    role: roleRow?.role ?? null,
  };
}

// Server-side route gate. Redirects to /login when signed out, or to "/" with a
// flash when signed in but missing the required role. Use at the top of any
// server component / layout that should be role-gated.
export async function requireRole(allowed: Role[]): Promise<AuthSession> {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.role || !allowed.includes(session.role)) redirect("/?error=forbidden");
  return session;
}

// Soft variant for pages that render publicly but reveal extra UI to certain
// roles. Returns the session when the role matches, otherwise null. Never
// redirects. Anonymous viewers also get null.
export async function getSessionIfRole(allowed: Role[]): Promise<AuthSession | null> {
  const session = await getAuthSession();
  if (!session || !session.role || !allowed.includes(session.role)) return null;
  return session;
}
