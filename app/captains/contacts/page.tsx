import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { SectionHeader } from "@/components/SectionHeader";

type RosterRow = {
  player_id: string;
  first_name: string;
  last_name: string;
  jersey: number | null;
  position: string;
  user_id: string | null;
  email: string | null;
  phone: string | null;
};

export default async function CaptainContactsPage() {
  await requireRole(["admin", "team_captain"]);
  const season = await getCurrentSeason();
  const supabase = await createSupabaseServerClient();

  const [{ data: teams }, { data: rosterRows }, { data: profiles }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, slug, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("team_players")
      .select(
        "team_id, jersey_number, position, players!inner(id, first_name, last_name, user_id)",
      )
      .eq("season_id", season.id),
    // RLS limits this select to admins/captains; anonymous viewers get 0 rows.
    supabase.from("user_profiles").select("user_id, email, phone"),
  ]);

  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, { email: p.email, phone: p.phone }]),
  );

  const rosterByTeam = new Map<string, RosterRow[]>();
  for (const row of rosterRows ?? []) {
    const player = row.players as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      user_id: string | null;
    };
    const profile = player.user_id ? profileByUser.get(player.user_id) : undefined;
    const list = rosterByTeam.get(row.team_id) ?? [];
    list.push({
      player_id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      jersey: row.jersey_number,
      position: row.position,
      user_id: player.user_id,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    });
    rosterByTeam.set(row.team_id, list);
  }

  return (
    <div className="space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="Captains"
          title="Contacts"
          subtitle={`${season.name} · email and phone for every linked player`}
          size="lg"
        />
      </div>

      <div className="rise delay-1 space-y-6">
        {(teams ?? []).map((team) => {
          const roster = (rosterByTeam.get(team.id) ?? []).sort((a, b) =>
            a.last_name.localeCompare(b.last_name),
          );
          const linked = roster.filter((p) => p.email || p.phone);
          const unlinked = roster.filter((p) => !p.email && !p.phone);

          return (
            <section key={team.id} className="panel p-5">
              <header className="flex items-center gap-3 mb-4">
                <div
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ background: team.color }}
                />
                <h2 className="font-display text-[22px] tracking-[0.04em] text-ink">
                  {team.name.toUpperCase()}
                </h2>
                <span className="eyebrow ml-auto">
                  {linked.length}/{roster.length} linked
                </span>
              </header>

              {linked.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No linked accounts yet. Players sign up at /signup, then an admin links them.
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {linked.map((p) => (
                    <li key={p.player_id} className="py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <div className="font-display text-[16px] tracking-[0.03em] text-ink min-w-[160px]">
                        {p.last_name}, {p.first_name}
                      </div>
                      <span className="eyebrow">
                        {p.position} {p.jersey != null ? `· #${p.jersey}` : ""}
                      </span>
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="font-mono text-xs text-ice hover:underline min-h-11 inline-flex items-center">
                          {p.email}
                        </a>
                      )}
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="font-mono text-xs text-ice hover:underline min-h-11 inline-flex items-center">
                          {p.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {unlinked.length > 0 && (
                <details className="mt-3">
                  <summary className="eyebrow cursor-pointer min-h-11 inline-flex items-center">
                    {unlinked.length} unlinked
                  </summary>
                  <ul className="mt-2 text-sm text-ink-faint space-y-1">
                    {unlinked.map((p) => (
                      <li key={p.player_id}>
                        {p.last_name}, {p.first_name}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
