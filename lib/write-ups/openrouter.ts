// One chat-completion call through OpenRouter (OpenAI-compatible API), with a
// fallback model. Model IDs come from env so they can be swapped in Vercel
// without a deploy.

import { logEvent } from "@/lib/log";

export type ModelResult = {
  text: string;
  model: string;
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  // For logs: OpenRouter's generation id (searchable in its dashboard), the
  // upstream provider, why the model stopped, and reasoning tokens used.
  id?: string | null;
  provider?: string | null;
  finishReason?: string | null;
  reasoningTokens?: number | null;
};

// A failed call, with whatever OpenRouter told us about it.
class ModelCallError extends Error {
  constructor(message: string, readonly details: Record<string, unknown>) {
    super(message);
  }
}

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
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    provider?: string;
    model?: string;
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    error?: { message?: string; code?: number | string };
  };
  const choice = json.choices?.[0];
  const details = {
    status: res.status,
    id: json.id ?? null,
    provider: json.provider ?? null,
    finish: choice?.finish_reason ?? null,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
    reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    costUsd: json.usage?.cost ?? null,
  };
  if (!res.ok || json.error) throw new ModelCallError(`${model}: ${json.error?.message ?? `HTTP ${res.status}`}`, details);
  if (choice?.finish_reason === "length") throw new ModelCallError(`${model}: truncated (finish_reason=length)`, details);
  const text = choice?.message?.content?.trim();
  if (!text) throw new ModelCallError(`${model}: empty response`, details);
  return {
    text,
    model: json.model ?? model,
    costUsd: details.costUsd,
    promptTokens: details.promptTokens,
    completionTokens: details.completionTokens,
    id: details.id,
    provider: details.provider,
    finishReason: details.finish,
    reasoningTokens: details.reasoningTokens,
  };
}

type CallInfo = { role: "primary" | "fallback"; requested: string; promptChars: number; maxTokens: number; timeoutMs: number; context: Record<string, string> };

// One "ai.call" log line per model call: what asked for it (context), which
// model and provider answered, timing, tokens, cost — or why it failed.
async function logged(info: CallInfo, call: () => Promise<ModelResult>): Promise<ModelResult> {
  const { context, ...rest } = info;
  const base = { ...context, ...rest };
  const start = Date.now();
  try {
    const r = await call();
    logEvent("ai.call", {
      ...base,
      ok: true,
      ms: Date.now() - start,
      model: r.model,
      provider: r.provider,
      id: r.id,
      finish: r.finishReason,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      reasoningTokens: r.reasoningTokens,
      costUsd: r.costUsd,
      outputChars: r.text.length,
    });
    return r;
  } catch (e) {
    const details = e instanceof ModelCallError ? e.details : {};
    logEvent("ai.call", { ...base, ok: false, ms: Date.now() - start, error: String(e), ...details }, "warn");
    throw e;
  }
}

// `maxTokens` caps output (reasoning tokens count too); game write-ups use the
// default, the season summary asks for more.
// `context` (e.g. { feature: "season-summary", season: slug }) is added to every log line.
export async function generateText(
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number; context?: Record<string, string> } = {},
): Promise<ModelResult> {
  const maxTokens = opts.maxTokens ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const primary = process.env.WRITE_UP_MODEL || DEFAULT_MODEL;
  const fallback = process.env.WRITE_UP_FALLBACK_MODEL || DEFAULT_FALLBACK;

  const info = (role: CallInfo["role"], requested: string): CallInfo => ({
    role,
    requested,
    promptChars: system.length + user.length,
    maxTokens,
    timeoutMs,
    context: opts.context ?? {},
  });

  try {
    return await logged(info("primary", primary), () => callOnce(apiKey, primary, system, user, maxTokens, timeoutMs));
  } catch (first) {
    logEvent("ai.fallback", { ...opts.context, from: primary, to: fallback, reason: String(first) }, "warn");
    try {
      return await logged(info("fallback", fallback), () => callOnce(apiKey, fallback, system, user, maxTokens, timeoutMs));
    } catch (second) {
      throw new Error(`both models failed — ${String(first)}; ${String(second)}`);
    }
  }
}
