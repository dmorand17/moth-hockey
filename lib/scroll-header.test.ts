import { describe, expect, test } from "bun:test";
import { headerVisible } from "./scroll-header";

describe("headerVisible", () => {
  test("shows header at or above the top", () => {
    expect(headerVisible(50, 0, false)).toBe(true);
    // iOS rubber-band overscroll reports negative scrollY
    expect(headerVisible(10, -30, false)).toBe(true);
  });

  test("hides after scrolling down past threshold", () => {
    expect(headerVisible(100, 120, true)).toBe(false);
  });

  test("ignores jitter under threshold", () => {
    expect(headerVisible(100, 104, true)).toBe(true);
    expect(headerVisible(100, 96, false)).toBe(false);
  });

  test("shows on scroll up past threshold", () => {
    expect(headerVisible(300, 280, false)).toBe(true);
  });
});
