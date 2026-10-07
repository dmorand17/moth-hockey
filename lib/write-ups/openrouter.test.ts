import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { generateText } from "@/lib/write-ups/openrouter";

const realFetch = globalThis.fetch;
const originalEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  WRITE_UP_MODEL: process.env.WRITE_UP_MODEL,
  WRITE_UP_FALLBACK_MODEL: process.env.WRITE_UP_FALLBACK_MODEL,
};
const calls: { model: string; reasoning?: unknown }[] = [];

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls.length = 0;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.WRITE_UP_MODEL = "openai/gpt-6-luna";
  process.env.WRITE_UP_FALLBACK_MODEL = "google/gemini-2.5-flash-lite";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env.OPENROUTER_API_KEY = originalEnv.OPENROUTER_API_KEY;
  process.env.WRITE_UP_MODEL = originalEnv.WRITE_UP_MODEL;
  process.env.WRITE_UP_FALLBACK_MODEL = originalEnv.WRITE_UP_FALLBACK_MODEL;
  if (originalEnv.OPENROUTER_API_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  if (originalEnv.WRITE_UP_MODEL === undefined) delete process.env.WRITE_UP_MODEL;
  if (originalEnv.WRITE_UP_FALLBACK_MODEL === undefined) delete process.env.WRITE_UP_FALLBACK_MODEL;
});

describe("generateText", () => {
  test("uses the primary model, with low reasoning for OpenAI models", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      return respond(200, { model: body.model, choices: [{ message: { content: "Headline\n\nBody" } }], usage: { cost: 0.0002, prompt_tokens: 900, completion_tokens: 210 } });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r).toEqual({ text: "Headline\n\nBody", model: "openai/gpt-6-luna", costUsd: 0.0002, promptTokens: 900, completionTokens: 210 });
    expect(calls).toEqual([{ model: "openai/gpt-6-luna", reasoning: { effort: "low" } }]);
  });

  test("falls back when the primary errors, without reasoning for non-OpenAI models", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      if (body.model.startsWith("openai/")) return respond(503, { error: { message: "overloaded" } });
      return respond(200, { model: body.model, choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r.model).toBe("google/gemini-2.5-flash-lite");
    expect(r.costUsd).toBeNull();
    expect(r.promptTokens).toBeNull();
    expect(r.completionTokens).toBeNull();
    expect(calls.map((c) => c.model)).toEqual(["openai/gpt-6-luna", "google/gemini-2.5-flash-lite"]);
    expect(calls[1].reasoning).toBeUndefined();
  });

  test("throws when both models fail", async () => {
    globalThis.fetch = mock(async () => respond(500, { error: { message: "down" } })) as unknown as typeof fetch;
    await expect(generateText("sys", "user")).rejects.toThrow(/both models failed/);
  });

  test("throws a clear error with no API key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(generateText("sys", "user")).rejects.toThrow("OPENROUTER_API_KEY is not set");
  });

  test("falls back when primary times out due to AbortSignal", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      if (body.model.startsWith("openai/")) {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return respond(200, { model: body.model, choices: [{ message: { content: "fallback response" } }], usage: { cost: 0.0001, prompt_tokens: 500, completion_tokens: 100 } });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r.model).toBe("google/gemini-2.5-flash-lite");
    expect(r.text).toBe("fallback response");
    expect(r.costUsd).toBe(0.0001);
    expect(r.promptTokens).toBe(500);
    expect(r.completionTokens).toBe(100);
    expect(calls.map((c) => c.model)).toEqual(["openai/gpt-6-luna", "google/gemini-2.5-flash-lite"]);
  });
});
