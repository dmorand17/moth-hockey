import { expect, spyOn, test } from "bun:test";
import { logEvent } from "@/lib/log";

test("logEvent writes one JSON line with the event name and data, dropping undefined", () => {
  const info = spyOn(console, "info").mockImplementation(() => {});
  logEvent("ai.call", { model: "m", tokens: 12, missing: undefined });
  expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({ event: "ai.call", model: "m", tokens: 12 });
  info.mockRestore();
});

test("logEvent uses the requested level", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  logEvent("ai.fallback", { from: "a" }, "warn");
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
