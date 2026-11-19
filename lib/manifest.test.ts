import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const pub = join(import.meta.dir, "..", "public");
const manifest = JSON.parse(readFileSync(join(pub, "manifest.webmanifest"), "utf8"));

describe("web app manifest", () => {
  test("identity fields", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.lang).toBe("en");
    expect(manifest.categories).toEqual(["sports"]);
    expect(manifest.theme_color).toBe("#0b0d10");
    expect(manifest.background_color).toBe("#0b0d10");
  });

  test("192 and 512 any-purpose icons plus a 512 maskable icon", () => {
    const has = (sizes: string, purpose: string) =>
      manifest.icons.some((i: { sizes: string; purpose?: string }) => i.sizes === sizes && (i.purpose ?? "any") === purpose);
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  test("every icon file exists", () => {
    for (const i of manifest.icons) expect(existsSync(join(pub, i.src))).toBe(true);
  });
});
