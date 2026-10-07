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

async function callOnce(apiKey: string, model: string, system: string, user: string): Promise<ModelResult> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 1000,
    usage: { include: true },
  };
  // OpenAI's reasoning models default to medium effort; a 150-word write-up
  // from precomputed stats doesn't need it, and reasoning tokens bill as output.
  if (model.startsWith("openai/")) body.reasoning = { effort: "low" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "moth-hockey write-ups",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok || json.error) throw new Error(`${model}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${model}: empty response`);
  return {
    text,
    model: json.model ?? model,
    costUsd: json.usage?.cost ?? null,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
  };
}

export async function generateText(system: string, user: string): Promise<ModelResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const primary = process.env.WRITE_UP_MODEL || DEFAULT_MODEL;
  const fallback = process.env.WRITE_UP_FALLBACK_MODEL || DEFAULT_FALLBACK;

  try {
    return await callOnce(apiKey, primary, system, user);
  } catch (first) {
    try {
      return await callOnce(apiKey, fallback, system, user);
    } catch (second) {
      throw new Error(`both models failed — ${String(first)}; ${String(second)}`);
    }
  }
}
