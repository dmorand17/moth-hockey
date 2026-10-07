import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadPreviewSource, loadRecapSource } from "@/lib/write-ups/data";
import { generateText } from "@/lib/write-ups/openrouter";
import { parseWriteUp } from "@/lib/write-ups/parse";
import { buildPreviewInput, buildRecapInput, SYSTEM_PROMPT, userMessage, type WriteUpKind } from "@/lib/write-ups/prompt";

export type GenerateResult = {
  gameId: string;
  kind: WriteUpKind;
  status: "created" | "exists" | "not_ready" | "failed";
  detail?: string;
};

// Generate one write-up and store it. Never throws: callers (cron, after())
// log the result and move on. Never overwrites — admin edits survive re-runs.
export async function generateAndStore(kind: WriteUpKind, gameId: string): Promise<GenerateResult> {
  const result = (status: GenerateResult["status"], detail?: string): GenerateResult => {
    const r = { gameId, kind, status, detail };
    (status === "failed" ? console.error : console.info)("[write-ups]", JSON.stringify(r));
    return r;
  };

  try {
    const db = createSupabaseServiceClient();
    const { data: existing } = await db
      .from("game_write_ups")
      .select("game_id")
      .eq("game_id", gameId)
      .eq("kind", kind)
      .maybeSingle();
    if (existing) return result("exists");

    const input =
      kind === "preview"
        ? await loadPreviewSource(db, gameId).then((s) => (s ? buildPreviewInput(s) : null))
        : await loadRecapSource(db, gameId).then((s) => (s ? buildRecapInput(s) : null));
    if (!input) return result("not_ready", "game is not in the right state");

    const out = await generateText(SYSTEM_PROMPT, userMessage(kind, input));
    const parsed = parseWriteUp(out.text);
    if (!parsed.ok) return result("failed", `${out.model}: ${parsed.reason}`);

    const { error } = await db.from("game_write_ups").upsert(
      { game_id: gameId, kind, headline: parsed.headline, body: parsed.body, model: out.model },
      { onConflict: "game_id,kind", ignoreDuplicates: true },
    );
    if (error) return result("failed", error.message);
    return result("created", `${out.model}${out.costUsd != null ? ` $${out.costUsd.toFixed(5)}` : ""}`);
  } catch (e) {
    return result("failed", e instanceof Error ? e.message : String(e));
  }
}
