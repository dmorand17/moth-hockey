import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { linkUserToPlayer, updateUserRole } from "./actions";

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
};

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const flash = params.saved;
  const error = params.error;

  const [
    { data: profiles },
    { data: roles },
    { data: linkedPlayers },
    { data: allPlayers },
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
  ]);

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  const linkByUser = new Map(
    (linkedPlayers ?? []).map((p) => [p.user_id!, { id: p.id, name: `${p.first_name} ${p.last_name}` }]),
  );

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

      <section className="space-y-1">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink mb-2">USERS</h2>
        {(profiles ?? []).length === 0 ? (
          <p className="text-ink-dim text-sm">No signed-up users yet.</p>
        ) : (
          (profiles ?? []).map((profile) => {
            const role = roleByUser.get(profile.user_id) ?? null;
            const link = linkByUser.get(profile.user_id);
            return (
              <details key={profile.user_id} id={profile.user_id} className="group border border-rule rounded">
                <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                  <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                    ▶
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-ink text-[13px]">
                      {profile.full_name || profile.email}
                    </span>
                    {profile.full_name && (
                      <span className="ml-2 font-mono text-[11px] text-ink-faint">
                        {profile.email}
                      </span>
                    )}
                  </span>
                  <span className="eyebrow text-[10px] text-ink-faint shrink-0">
                    {role ?? "—"}
                  </span>
                </summary>

                <div className="border-t border-rule px-3 py-3 space-y-3">
                  <form action={updateUserRole} className="flex flex-wrap items-end gap-2">
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
                    <div className="pb-0.5">
                      <button
                        type="submit"
                        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                      >
                        SAVE
                      </button>
                    </div>
                  </form>

                  <form action={linkUserToPlayer} className="flex flex-wrap items-end gap-2">
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
                    <div className="pb-0.5">
                      <button
                        type="submit"
                        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                      >
                        SAVE
                      </button>
                    </div>
                  </form>
                </div>
              </details>
            );
          })
        )}
      </section>
    </div>
  );
}
