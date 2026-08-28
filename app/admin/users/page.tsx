import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateUserRole } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

// Roster of signed-up accounts with created/updated timestamps. Roles are
// changed here; player linking is managed on /admin/players.

type Role = "admin" | "scorekeeper" | "team_captain" | "player";

// team_captain is derived from team captaincy (managed on Teams), so it isn't
// an option here — captains show as read-only.
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "scorekeeper", label: "Scorekeeper" },
  { value: "player", label: "Player" },
];

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const ROLE_CLASS: Record<Role, string> = {
  admin: "text-goal border-goal/40 bg-goal/10",
  scorekeeper: "text-ice border-ice/40 bg-ice/10",
  team_captain: "text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10",
  player: "text-ink-dim border-rule bg-board-3",
};

export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const [{ data: profiles }, { data: roles }, { data: players }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, email, full_name, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("players").select("id, first_name, last_name, user_id"),
  ]);

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role as Role]));
  const playerByUser = new Map(
    (players ?? [])
      .filter((p) => p.user_id)
      .map((p) => [p.user_id as string, { id: p.id, name: `${p.last_name}, ${p.first_name}` }]),
  );

  const users = (profiles ?? []).map((p) => ({
    user_id: p.user_id,
    email: p.email,
    full_name: p.full_name,
    role: (roleByUser.get(p.user_id) ?? "player") as Role,
    player: playerByUser.get(p.user_id) ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">USERS</h2>
        <span className="eyebrow">{users.length} total</span>
      </header>
      <p className="text-ink-dim text-[12px]">
        Signed-up accounts, newest first. Change roles here; link accounts to
        players on{" "}
        <Link href="/admin/players" className="text-ice hover:underline">
          Players
        </Link>
        .
      </p>

      {users.length === 0 ? (
        <p className="text-ink-dim text-sm panel-bare p-4">No accounts yet.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="board-table">
            <thead>
              <tr>
                <th className="text-left pl-5">Account</th>
                <th className="text-left">Role</th>
                <th className="text-left">Player</th>
                <th className="text-left">Created</th>
                <th className="text-left pr-5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} id={`user-${u.user_id}`} className="scroll-mt-24 target:bg-ice/5">
                  <td className="pl-5">
                    <span className="block text-ink">{u.full_name || u.email}</span>
                    {u.full_name && (
                      <span className="block font-mono text-[11px] text-ink-faint">{u.email}</span>
                    )}
                  </td>
                  <td>
                    {u.role === "team_captain" ? (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] border font-mono text-[10.5px] uppercase tracking-[0.12em] ${ROLE_CLASS.team_captain}`}
                        title="Captaincy is set on Teams"
                      >
                        captain
                      </span>
                    ) : (
                      <ActionForm action={updateUserRole} className="flex items-center gap-1.5">
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <SubmitButton className="px-2 py-1 min-h-8 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors">
                          SAVE
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </td>
                  <td>
                    {u.player ? (
                      <span className="text-ink">{u.player.name}</span>
                    ) : (
                      <span className="eyebrow text-goal/80">Unlinked</span>
                    )}
                  </td>
                  <td className="text-ink-dim font-mono text-[12px] whitespace-nowrap">
                    {fmt(u.created_at)}
                  </td>
                  <td className="pr-5 text-ink-dim font-mono text-[12px] whitespace-nowrap">
                    {fmt(u.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
