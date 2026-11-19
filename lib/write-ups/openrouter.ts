// One chat-completion call through OpenRouter (OpenAI-compatible API), with a
// fallback model. Model IDs come from env so they can be swapped in Vercel
// without a deploy.

export type ModelResult = {
  text: string;
  model: string;
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-6-luna";
const DEFAULT_FALLBACK = "google/gemini-2.5-flash-lite";

async function callOnce(apiKey: string, model: string, system: string, user: string, maxTokens: number, timeoutMs: number): Promise<ModelResult> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    usage: { include: true },
  };
  // Reasoning models (OpenAI, DeepSeek, Gemini…) default to medium effort.
  // Writing from precomputed stats doesn't need it, and reasoning tokens count
  // against max_tokens and the timeout. OpenRouter's unified param: "low" caps
  // reasoning at ~20% of max_tokens; non-reasoning models ignore it.
  body.reasoning = { effort: "low" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "moth-hockey write-ups",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok || json.error) throw new Error(`${model}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  const choice = json.choices?.[0];
  const usage = `${json.usage?.prompt_tokens ?? "?"} in / ${json.usage?.completion_tokens ?? "?"} out`;
  if (choice?.finish_reason === "length") throw new Error(`${model}: truncated (finish_reason=length, ${usage})`);
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error(`${model}: empty response (finish_reason=${choice?.finish_reason ?? "none"}, ${usage})`);
  return {
    text,
    model: json.model ?? model,
    costUsd: json.usage?.cost ?? null,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
  };
}

// One line per model call in the Vercel runtime logs: which model, how long,
// tokens and cost on success; the error (truncated, empty, timeout, HTTP) on failure.
async function logged(model: string, role: "primary" | "fallback", call: () => Promise<ModelResult>): Promise<ModelResult> {
  const start = Date.now();
  try {
    const r = await call();
    console.info(
      `[ai] ${role} ${r.model} ok in ${Date.now() - start}ms (${r.promptTokens ?? "?"} in / ${r.completionTokens ?? "?"} out, $${r.costUsd ?? "?"})`,
    );
    return r;
  } catch (e) {
    console.info(`[ai] ${role} ${model} failed after ${Date.now() - start}ms: ${String(e)}`);
    throw e;
  }
}

// `maxTokens` caps output (reasoning tokens count too); game write-ups use the
// default, the season summary asks for more.
export async function generateText(system: string, user: string, opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<ModelResult> {
  const maxTokens = opts.maxTokens ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const primary = process.env.WRITE_UP_MODEL || DEFAULT_MODEL;
  const fallback = process.env.WRITE_UP_FALLBACK_MODEL || DEFAULT_FALLBACK;

  try {
    return await logged(primary, "primary", () => callOnce(apiKey, primary, system, user, maxTokens, timeoutMs));
  } catch (first) {
    console.warn(`[ai] primary ${primary} failed, using fallback ${fallback}: ${String(first)}`);
    try {
      return await logged(fallback, "fallback", () => callOnce(apiKey, fallback, system, user, maxTokens, timeoutMs));
    } catch (second) {
      throw new Error(`both models failed — ${String(first)}; ${String(second)}`);
    }
  }
}
