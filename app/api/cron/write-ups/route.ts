import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateAndStore, type GenerateResult } from "@/lib/write-ups/generate";

// Previews look 36h ahead (not 24h) so Sunday-evening games, which land just
// after midnight UTC, are still caught by Saturday's 18:00 UTC run.
const PREVIEW_WINDOW_HOURS = 36;
// Recaps are normally written right after finalize; this is the backstop.
const RECAP_LOOKBACK_DAYS = 7;

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Fail loudly instead of returning 200 with every job "failed".
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not set" }, { status: 500 });
  }

  const db = createSupabaseServiceClient();
  const now = Date.now();
  const until = new Date(now + PREVIEW_WINDOW_HOURS * 3_600_000).toISOString();
  const since = new Date(now - RECAP_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [upcomingRes, recentRes, existingRes] = await Promise.all([
    db.from("games").select("id")
      .eq("status", "scheduled").not("home_team_id", "is", null).not("away_team_id", "is", null)
      .gte("scheduled_at", new Date(now).toISOString()).lte("scheduled_at", until),
    db.from("games").select("id").eq("status", "final").gte("scheduled_at", since),
    db.from("game_write_ups").select("game_id, kind").gte("generated_at", new Date(now - 30 * 86_400_000).toISOString()),
  ]);
  if (upcomingRes.error) return NextResponse.json({ error: `upcoming games: ${upcomingRes.error.message}` }, { status: 500 });
  if (recentRes.error) return NextResponse.json({ error: `recent games: ${recentRes.error.message}` }, { status: 500 });
  if (existingRes.error) return NextResponse.json({ error: `existing write-ups: ${existingRes.error.message}` }, { status: 500 });
  const { data: upcoming } = upcomingRes;
  const { data: recent } = recentRes;
  const { data: existing } = existingRes;

  const have = new Set((existing ?? []).map((w) => `${w.game_id}:${w.kind}`));
  const jobs: { kind: "preview" | "recap"; gameId: string }[] = [
    ...(upcoming ?? []).filter((g) => !have.has(`${g.id}:preview`)).map((g) => ({ kind: "preview" as const, gameId: g.id })),
    ...(recent ?? []).filter((g) => !have.has(`${g.id}:recap`)).map((g) => ({ kind: "recap" as const, gameId: g.id })),
  ];

  // One at a time: a handful of games per day, and it keeps OpenRouter calls
  // and logs easy to follow. Failures don't stop the rest.
  const results: GenerateResult[] = [];
  for (const job of jobs) results.push(await generateAndStore(job.kind, job.gameId));

  return NextResponse.json({ results });
}
