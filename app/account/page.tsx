import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PhoneInput from "@/components/PhoneInput";
import { CheckInToggle } from "@/components/CheckInToggle";
import { getCurrentSeason } from "@/lib/queries";
import { formatDate, formatTime } from "@/lib/format";
import { signOut, updateProfile } from "./actions";

type SearchParams = Promise<{ saved?: string; error?: string }>;

type TeamRef = { id: string; name: string; slug: string; color: string };
type RosterRow = {
  jersey_number: number | null;
  position: "forward" | "defense" | "goalie";
  team: TeamRef | null;
};
type NextGame = {
  id: string;
  scheduled_at: string;
  location: string | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};
const POSITION_LABELS: Record<RosterRow["position"], string> = {
  forward: "Forward",
  defense: "Defense",
  goalie: "Goalie",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  scorekeeper: "Scorekeeper",
  team_captain: "Team Captain",
  player: "Player",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "var(--goal)",
  scorekeeper: "var(--ice)",
  team_captain: "#fbbf24",
  player: "var(--ink-dim)",
};

// First initials for the team monogram, e.g. "Ice Holes" → "IH".
function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

  let roster: RosterRow | null = null;
  let nextGame: NextGame | null = null;
  let availability: "in" | "out" | null = null;

  if (linkedPlayer) {
    const season = await getCurrentSeason();
    if (season) {
      const { data: rosterRaw } = await supabase
        .from("team_players")
        .select("jersey_number, position, team:team_id(id, name, slug, color)")
        .eq("player_id", linkedPlayer.id)
        .eq("season_id", season.id)
        .maybeSingle();
      roster = rosterRaw as unknown as RosterRow | null;

      if (roster?.team) {
        const teamId = roster.team.id;
        const { data: gameRaw } = await supabase
          .from("games")
          .select(
            "id, scheduled_at, location, " +
              "home_team:home_team_id(id, name, slug, color), " +
              "away_team:away_team_id(id, name, slug, color)",
          )
          .eq("season_id", season.id)
          .eq("status", "scheduled")
          .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        nextGame = gameRaw as unknown as NextGame | null;

        if (nextGame) {
          const { data: avail } = await supabase
            .from("game_availability")
            .select("status")
            .eq("game_id", nextGame.id)
            .eq("player_id", linkedPlayer.id)
            .maybeSingle();
          availability = (avail?.status as "in" | "out" | undefined) ?? null;
        }
      }
    }
  }

  const params = await searchParams;
  const saved = params.saved === "1";
  const error = params.error;
  const roleLabel = roleRow?.role ? ROLE_LABELS[roleRow.role] ?? roleRow.role : "—";
  const roleColor = ROLE_COLOR[roleRow?.role ?? "player"] ?? "var(--ink-dim)";

  return (
    <div className="mx-auto max-w-md rise">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-[0.06em] text-ink">ACCOUNT</h1>
        <p className="eyebrow mt-2">Your Profile</p>
      </header>

      <section
        className="panel p-5 space-y-4"
        style={{ borderLeftWidth: 3, borderLeftColor: "var(--ice)" }}
      >
        {/* Read-only identity — compact */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[12px] text-ink-dim truncate">
            {profile?.email ?? userData.user.email}
          </span>
          <span className="text-rule-strong text-[12px]">·</span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-[2px] border font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{
              color: roleColor,
              borderColor: `color-mix(in srgb, ${roleColor} 45%, transparent)`,
              background: `color-mix(in srgb, ${roleColor} 12%, transparent)`,
            }}
          >
            {roleLabel}
          </span>
        </div>

        {/* Linked player */}
        <div className="flex items-center justify-between gap-3 border-t border-rule/60 pt-4">
          <div className="min-w-0">
            <div className="eyebrow">Linked player</div>
            <div className="text-ink mt-0.5 truncate">
              {linkedPlayer ? (
                `${linkedPlayer.first_name} ${linkedPlayer.last_name}`
              ) : (
                <span className="text-ink-faint text-[13px]">
                  Not linked yet — an admin will connect you to your roster row.
                </span>
              )}
            </div>
          </div>
          {linkedPlayer && (
            <Link
              href={`/players/${linkedPlayer.id}`}
              className="eyebrow text-ice hover:text-ink shrink-0 min-h-11 inline-flex items-center"
            >
              View player page →
            </Link>
          )}
        </div>

        {/* Current team — the headline of this card */}
        {roster?.team && (
          <Link
            href={`/teams/${roster.team.slug}`}
            className="block rounded-lg border-l-[3px] p-4 tap transition-[filter] hover:brightness-125"
            style={{
              borderColor: roster.team.color,
              background: `linear-gradient(90deg, ${roster.team.color}2e, transparent 72%)`,
            }}
          >
            <div className="eyebrow" style={{ color: roster.team.color }}>
              Current team
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center h-11 w-11 rounded-md font-display text-[17px] tracking-tight text-board shrink-0"
                  style={{ background: roster.team.color }}
                >
                  {teamInitials(roster.team.name)}
                </span>
                <span className="font-display text-[22px] sm:text-[26px] leading-none tracking-[0.04em] text-ink truncate">
                  {roster.team.name.toUpperCase()}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div className="digit text-2xl text-ink leading-none">
                  #{roster.jersey_number ?? "—"}
                </div>
                <div className="eyebrow mt-1">{POSITION_LABELS[roster.position]}</div>
              </div>
            </div>
          </Link>
        )}

        <details
          open={saved || !!error}
          className="group border-t border-rule pt-4"
        >
          <summary className="flex items-center justify-between gap-3 cursor-pointer list-none select-none">
            <span className="font-display text-[15px] tracking-[0.12em] text-ice">
              EDIT PROFILE
            </span>
            <span
              aria-hidden
              className="eyebrow text-ice text-[10px] transition-transform group-open:rotate-90"
            >
              ▶
            </span>
          </summary>
          <form action={updateProfile} className="space-y-4 mt-4" noValidate>
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
              <PhoneInput
                name="phone"
                defaultValue={profile?.phone ?? ""}
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
        </details>
      </section>

      {roster?.team && (
        <section
          className="panel p-5 space-y-4 mt-5"
          style={{ borderLeftWidth: 3, borderLeftColor: roster.team!.color }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              className="font-display text-xl tracking-[0.06em]"
              style={{ color: roster.team!.color }}
            >
              YOUR NEXT GAME
            </h2>
            {nextGame && (
              <Link
                href={`/games/${nextGame.id}`}
                className="eyebrow text-ice hover:text-ink shrink-0"
              >
                View game →
              </Link>
            )}
          </div>

          {nextGame ? (
            <>
              {(() => {
                const teamId = roster.team!.id;
                const opponent =
                  nextGame.home_team?.id === teamId
                    ? nextGame.away_team
                    : nextGame.home_team;
                return (
                  <div className="text-ink">
                    <div className="text-[15px]">
                      vs {opponent?.name ?? "TBD"}
                    </div>
                    <div className="eyebrow text-ink-faint mt-1">
                      {formatDate(nextGame.scheduled_at)} ·{" "}
                      {formatTime(nextGame.scheduled_at)}
                      {nextGame.location ? ` · ${nextGame.location}` : ""}
                    </div>
                  </div>
                );
              })()}
              <CheckInToggle gameId={nextGame.id} status={availability} />
            </>
          ) : (
            <p className="text-ink-faint text-sm">No upcoming games scheduled.</p>
          )}
        </section>
      )}

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
