import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
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
    expect(r).toMatchObject({ text: "Headline\n\nBody", model: "openai/gpt-6-luna", costUsd: 0.0002, promptTokens: 900, completionTokens: 210 });
    expect(calls).toEqual([{ model: "openai/gpt-6-luna", reasoning: { effort: "low" } }]);
  });

  test("falls back when the primary errors, logging why; every model gets low reasoning", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
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
    expect(calls[1].reasoning).toEqual({ effort: "low" });
    expect(String(warn.mock.calls[0]?.join(" "))).toContain("overloaded");
    warn.mockRestore();
  });

  test("DeepSeek primaries get low reasoning too", async () => {
    process.env.WRITE_UP_MODEL = "deepseek/deepseek-v4.1-flash-1017";
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      return respond(200, { choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;
    await generateText("s", "u");
    expect(calls).toEqual([{ model: "deepseek/deepseek-v4.1-flash-1017", reasoning: { effort: "low" } }]);
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

  test("falls back when primary returns finish_reason=length", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      if (body.model.startsWith("openai/")) {
        return respond(200, {
          model: body.model,
          choices: [{ message: { content: "truncated text" }, finish_reason: "length" }],
          usage: { cost: 0.0001, prompt_tokens: 900, completion_tokens: 1000 },
        });
      }
      return respond(200, { model: body.model, choices: [{ message: { content: "fallback ok" }, finish_reason: "stop" }] });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r.model).toBe("google/gemini-2.5-flash-lite");
    expect(r.text).toBe("fallback ok");
    expect(calls.map((c) => c.model)).toEqual(["openai/gpt-6-luna", "google/gemini-2.5-flash-lite"]);
  });
  test("passes maxTokens through, defaulting to 1000", async () => {
    const sent: number[] = [];
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init!.body)).max_tokens);
      return respond(200, { choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;
    await generateText("s", "u", { maxTokens: 4000 });
    await generateText("s", "u");
    expect(sent).toEqual([4000, 1000]);
  });
  test("passes timeoutMs through, defaulting to 30s", async () => {
    const spy = spyOn(AbortSignal, "timeout");
    globalThis.fetch = mock(async () => respond(200, { choices: [{ message: { content: "ok" } }] })) as unknown as typeof fetch;
    await generateText("s", "u", { timeoutMs: 75_000 });
    await generateText("s", "u");
    expect(spy.mock.calls.map((c) => c[0])).toEqual([75_000, 30_000]);
    spy.mockRestore();
  });
  test("logs each call as structured JSON with context and OpenRouter details", async () => {
    const info = spyOn(console, "info").mockImplementation(() => {});
    globalThis.fetch = mock(async () =>
      respond(200, {
        id: "gen-123",
        provider: "DeepInfra",
        model: "openai/gpt-6-luna",
        choices: [{ message: { content: "Hello there" }, finish_reason: "stop" }],
        usage: { cost: 0.001, prompt_tokens: 900, completion_tokens: 400, completion_tokens_details: { reasoning_tokens: 120 } },
      }),
    ) as unknown as typeof fetch;
    await generateText("sys", "user msg", { maxTokens: 6000, timeoutMs: 75_000, context: { feature: "season-summary", season: "spring-2026" } });
    const line = JSON.parse(info.mock.calls.map((c) => String(c[0])).find((c) => c.includes('"ai.call"'))!);
    expect(line).toMatchObject({
      event: "ai.call", feature: "season-summary", season: "spring-2026", role: "primary", ok: true,
      requested: "openai/gpt-6-luna", model: "openai/gpt-6-luna", provider: "DeepInfra", id: "gen-123", finish: "stop",
      promptTokens: 900, completionTokens: 400, reasoningTokens: 120, costUsd: 0.001,
      promptChars: 11, outputChars: 11, maxTokens: 6000, timeoutMs: 75_000,
    });
    expect(typeof line.ms).toBe("number");
    info.mockRestore();
  });

  test("a failed primary logs ok:false with status, then an ai.fallback warning", async () => {
    const info = spyOn(console, "info").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      if (body.model.startsWith("openai/")) return respond(503, { error: { message: "overloaded" } });
      return respond(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
    }) as unknown as typeof fetch;
    await generateText("s", "u", { context: { feature: "write-up" } });
    const lines = [...warn.mock.calls, ...info.mock.calls].map((c) => JSON.parse(String(c[0])));
    expect(lines).toContainEqual(expect.objectContaining({ event: "ai.call", role: "primary", ok: false, status: 503, feature: "write-up" }));
    expect(lines).toContainEqual(expect.objectContaining({ event: "ai.fallback", from: "openai/gpt-6-luna", to: "google/gemini-2.5-flash-lite" }));
    expect(lines).toContainEqual(expect.objectContaining({ event: "ai.call", role: "fallback", ok: true }));
    info.mockRestore();
    warn.mockRestore();
  });
});
