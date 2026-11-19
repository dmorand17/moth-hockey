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

describe("headerVisible at the bottom of the page", () => {
  test("settling back from iOS bottom overscroll keeps the header hidden", () => {
    // maxY 990: bounce reported 1010, then the page settles back to 990
    expect(headerVisible(1010, 990, false, 8, 990)).toBe(false);
    expect(headerVisible(1010, 1001, false, 8, 990)).toBe(false);
  });

  test("a real upward scroll from the bottom still shows it", () => {
    expect(headerVisible(990, 900, false, 8, 990)).toBe(true);
  });
});
