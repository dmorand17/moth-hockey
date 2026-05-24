import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut, updateProfile } from "./actions";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  scorekeeper: "Scorekeeper",
  team_captain: "Team Captain",
  player: "Player",
};

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const userId = userData.user.id;

  const [{ data: profile }, { data: roleRow }, { data: linkedPlayer }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("email, phone, full_name")
      .eq("user_id", userId)
      .single(),
    supabase.from("user_roles").select("role").eq("user_id", userId).single(),
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const params = await searchParams;
  const saved = params.saved === "1";
  const error = params.error;
  const roleLabel = roleRow?.role ? ROLE_LABELS[roleRow.role] ?? roleRow.role : "—";

  return (
    <div className="mx-auto max-w-md rise">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-[0.06em] text-ink">ACCOUNT</h1>
        <p className="eyebrow mt-2">Your profile + contact info</p>
      </header>

      <section className="panel p-5 space-y-4">
        <div>
          <div className="eyebrow">Email</div>
          <div className="font-mono text-ink mt-1">{profile?.email ?? userData.user.email}</div>
        </div>

        <div>
          <div className="eyebrow">Role</div>
          <div className="text-ink mt-1">{roleLabel}</div>
        </div>

        <div>
          <div className="eyebrow">Linked player</div>
          <div className="text-ink mt-1">
            {linkedPlayer
              ? `${linkedPlayer.first_name} ${linkedPlayer.last_name}`
              : <span className="text-ink-faint">Not linked yet — an admin will connect you to your roster row.</span>
            }
          </div>
        </div>
      </section>

      <form action={updateProfile} className="panel p-5 space-y-4 mt-5" noValidate>
        <h2 className="font-display text-xl tracking-[0.06em] text-ink">EDIT</h2>

        {saved && (
          <p role="status" className="text-ice text-sm">
            Saved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-goal text-sm">
            {error}
          </p>
        )}

        <label className="block">
          <span className="eyebrow">Full name</span>
          <input
            type="text"
            name="full_name"
            defaultValue={profile?.full_name ?? ""}
            autoComplete="name"
            className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
          />
        </label>

        <label className="block">
          <span className="eyebrow">Phone</span>
          <input
            type="tel"
            name="phone"
            defaultValue={profile?.phone ?? ""}
            autoComplete="tel"
            inputMode="tel"
            className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
          />
        </label>

        <button
          type="submit"
          className="w-full min-h-11 bg-goal hover:bg-goal-glow text-board font-display tracking-[0.14em] text-[15px] rounded transition-colors"
        >
          SAVE
        </button>
      </form>

      <form action={signOut} className="mt-5">
        <button
          type="submit"
          className="w-full min-h-11 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[15px] rounded transition-colors"
        >
          SIGN OUT
        </button>
      </form>
    </div>
  );
}
