import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlayerRow, Team, UnlinkedAccount } from "./PlayerFilters";

type RosterEntry = {
  season_id: string;
  position: "forward" | "defense" | "goalie";
  jersey_number: number | null;
  team: { id: string; name: string; color: string } | null;
};

// Loads the admin players screen's data for a season: every player flattened
// with that season's roster entry and linked account, plus the linking
// callout's lists. Shared by the page and the CSV export route.
export async function loadAdminPlayers(seasonId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: rawPlayers }, { data: profiles }, { data: roles }] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          "id, first_name, last_name, user_id, team_players(season_id, position, jersey_number, team:team_id(id, name, color))",
        )
        .order("last_name")
        .order("first_name"),
      supabase
        .from("user_profiles")
        .select("user_id, email, full_name")
        .order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p]),
  );

  // Flatten players into rows with current-season roster + linked account.
  const players: PlayerRow[] = (rawPlayers ?? []).map((p) => {
    const rosterEntry = (
      p.team_players as unknown as RosterEntry[]
    )?.find((tp) => tp.season_id === seasonId);

    const profile = p.user_id ? profileByUser.get(p.user_id) : null;

    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      current_team: rosterEntry?.team ?? null,
      jersey_number: rosterEntry?.jersey_number ?? null,
      position: rosterEntry?.position ?? null,
      account: p.user_id
        ? {
            user_id: p.user_id,
            email: profile?.email ?? "",
            role: roleByUser.get(p.user_id) ?? null,
          }
        : null,
    };
  });

  // Accounts that exist but aren't linked to any player → the "Needs linking"
  // callout, and the per-row "link account" dropdown in the list.
  const linkedUserIds = new Set(
    (rawPlayers ?? []).map((p) => p.user_id).filter((id): id is string => !!id),
  );
  const unlinkedAccounts: UnlinkedAccount[] = (profiles ?? [])
    .filter((p) => !linkedUserIds.has(p.user_id))
    .map((p) => ({
      user_id: p.user_id,
      email: p.email,
      full_name: p.full_name,
      role: roleByUser.get(p.user_id) ?? null,
    }));

  // Players with no account → "link to player" dropdown in the callout.
  const unlinkedPlayers = (rawPlayers ?? [])
    .filter((p) => !p.user_id)
    .map((p) => ({ id: p.id, name: `${p.last_name}, ${p.first_name}` }));

  // Derive unique teams from rostered players (sorted by name)
  const teamMap = new Map<string, Team>();
  for (const p of players) {
    if (p.current_team && !teamMap.has(p.current_team.id)) {
      teamMap.set(p.current_team.id, p.current_team);
    }
  }
  const teams = Array.from(teamMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );


  return { players, unlinkedAccounts, unlinkedPlayers, teams };
}
