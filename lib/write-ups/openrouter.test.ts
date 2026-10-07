import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { generateText } from "@/lib/write-ups/openrouter";

const realFetch = globalThis.fetch;
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
});

describe("generateText", () => {
  test("uses the primary model, with low reasoning for OpenAI models", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      return respond(200, { model: body.model, choices: [{ message: { content: "Headline\n\nBody" } }], usage: { cost: 0.0002 } });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r).toEqual({ text: "Headline\n\nBody", model: "openai/gpt-6-luna", costUsd: 0.0002 });
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
});
