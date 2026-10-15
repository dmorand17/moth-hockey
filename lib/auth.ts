import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { pickTeams, type PostTeam, type RosterRow } from "@/lib/board";

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

export type BoardViewer = {
  userId: string;
  isAdmin: boolean;
  isLinked: boolean;
  /** The linked player's name and team, for the composer avatar. */
  name: string | null;
  team: PostTeam | null;
};

// Who's looking at a message board, and what they may do there. Posting
// requires a linked roster player; admins can edit/delete regardless.
export async function getBoardViewer(): Promise<BoardViewer | null> {
  const session = await getAuthSession();
  if (!session) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("user_id", session.userId)
    .maybeSingle();
  let team: PostTeam | null = null;
  if (data) {
    const { data: rosters } = await supabase
      .from("team_players")
      .select("player_id, team:teams(name, slug, color), season:seasons(is_current, start_date)")
      .eq("player_id", data.id);
    team = pickTeams((rosters ?? []) as RosterRow[]).get(data.id) ?? null;
  }
  return {
    userId: session.userId,
    isAdmin: session.role === "admin",
    isLinked: !!data,
    name: data ? `${data.first_name} ${data.last_name}` : null,
    team,
  };
}
