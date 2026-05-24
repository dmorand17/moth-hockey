import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import type { Database } from "@/lib/supabase/database.types";
import { assignTeamCaptain, linkUserToPlayer, updateUserRole } from "./actions";

type Role = Database["public"]["Enums"]["user_role"];
type SearchParams = Promise<{ saved?: string; error?: string }>;

// 'team_captain' is intentionally omitted — the role is derived from
// team_captains assignments via trigger, not picked manually.
const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "scorekeeper", label: "Scorekeeper" },
  { value: "player", label: "Player" },
];

const FLASH_MESSAGES: Record<string, string> = {
  role: "Role updated.",
  link: "Player link updated.",
  captain: "Captain assignment updated.",
};

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();

  const params = await searchParams;
  const flash = params.saved;
  const error = params.error;

  const [
    { data: profiles },
    { data: roles },
    { data: linkedPlayers },
    { data: allPlayers },
    { data: teams },
    { data: captains },
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, email, full_name, phone")
      .order("created_at", { ascending: true }),
    supabase.from("user_roles").select("user_id, role"),
    supabase
      .from("players")
      .select("id, user_id, first_name, last_name")
      .not("user_id", "is", null),
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase
      .from("teams")
      .select("id, name, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("team_captains")
      .select("team_id, user_id")
      .eq("season_id", season.id),
  ]);

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  const linkByUser = new Map(
    (linkedPlayers ?? []).map((p) => [p.user_id!, { id: p.id, name: `${p.first_name} ${p.last_name}` }]),
  );
  const captainByTeam = new Map((captains ?? []).map((c) => [c.team_id, c.user_id]));
  const userLabel = (id: string) => {
    const profile = (profiles ?? []).find((p) => p.user_id === id);
    return profile?.full_name || profile?.email || id;
  };

  return (
    <div className="space-y-6">
      {flash && (
        <p role="status" className="text-ice text-sm">
          {FLASH_MESSAGES[flash] ?? "Saved."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-goal text-sm">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">CAPTAINS</h2>
          <span className="eyebrow">{season.name}</span>
        </header>
        <p className="text-sm text-ink-faint">
          Assigning a captain promotes the user&apos;s role to <code className="text-ink-dim">team_captain</code>.
          Removing them reverts to <code className="text-ink-dim">player</code> (admin/scorekeeper untouched).
        </p>
        <ul className="space-y-2">
          {(teams ?? []).map((team) => {
            const captainUserId = captainByTeam.get(team.id) ?? "";
            return (
              <li key={team.id} className="panel p-3">
                <form action={assignTeamCaptain} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="team_id" value={team.id} />
                  <input type="hidden" name="season_id" value={season.id} />
                  <div className="flex items-center gap-2 min-w-[160px]">
                    <span
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ background: team.color }}
                    />
                    <span className="font-display text-[16px] tracking-[0.04em] text-ink">
                      {team.name.toUpperCase()}
                    </span>
                  </div>
                  <label className="block flex-1 min-w-[200px]">
                    <span className="eyebrow">Captain</span>
                    <select
                      name="user_id"
                      defaultValue={captainUserId}
                      className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
                    >
                      <option value="">— No captain —</option>
                      {(profiles ?? []).map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {userLabel(p.user_id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                  >
                    SAVE
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">USERS</h2>
      {(profiles ?? []).length === 0 ? (
        <p className="text-ink-dim text-sm">No signed-up users yet.</p>
      ) : (
        <ul className="space-y-3">
          {(profiles ?? []).map((profile) => {
            const role = roleByUser.get(profile.user_id) ?? null;
            const link = linkByUser.get(profile.user_id);
            return (
              <li key={profile.user_id} className="panel p-4 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="font-display text-lg tracking-[0.04em] text-ink">
                    {profile.full_name || profile.email}
                  </div>
                  {profile.full_name && (
                    <div className="font-mono text-xs text-ink-dim">{profile.email}</div>
                  )}
                  {profile.phone && (
                    <div className="font-mono text-xs text-ink-faint">{profile.phone}</div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <form action={updateUserRole} className="flex flex-wrap items-end gap-2 flex-1">
                    <input type="hidden" name="user_id" value={profile.user_id} />
                    <label className="block flex-1 min-w-[160px]">
                      <span className="eyebrow">Role</span>
                      <select
                        name="role"
                        defaultValue={role ?? "player"}
                        className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                    >
                      SAVE
                    </button>
                  </form>

                  <form action={linkUserToPlayer} className="flex flex-wrap items-end gap-2 flex-1">
                    <input type="hidden" name="user_id" value={profile.user_id} />
                    <label className="block flex-1 min-w-[200px]">
                      <span className="eyebrow">Linked player</span>
                      <select
                        name="player_id"
                        defaultValue={link?.id ?? ""}
                        className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
                      >
                        <option value="">— Not linked —</option>
                        {(allPlayers ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.last_name}, {p.first_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                    >
                      SAVE
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </section>
    </div>
  );
}
