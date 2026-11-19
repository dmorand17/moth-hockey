import { describe, expect, test } from "bun:test";
import { paginate } from "./paginate";

const rows = Array.from({ length: 60 }, (_, i) => i);

describe("paginate", () => {
  test("empty list is one empty page", () => {
    expect(paginate([], 1, 25)).toEqual({ rows: [], page: 1, pages: 1 });
  });

  test("last page holds the remainder", () => {
    const out = paginate(rows, 3, 25);
    expect(out.rows).toHaveLength(10);
    expect(out.rows[0]).toBe(50);
    expect(out.pages).toBe(3);
    expect(out.page).toBe(3);
  });

  test("clamps a page past the end to the last page", () => {
    expect(paginate(rows, 9, 25).page).toBe(3);
  });

  test("clamps a page below 1 to the first page", () => {
    const out = paginate(rows, 0, 25);
    expect(out.page).toBe(1);
    expect(out.rows[0]).toBe(0);
  });
});
