import { describe, expect, test } from "bun:test";
import { summaryActions } from "@/lib/recap-summary/admin";

describe("summaryActions", () => {
  test("nothing yet: generate only", () => {
    expect(summaryActions({ hasDraft: false, hasPublished: false, live: false })).toEqual(["generate"]);
  });
  test("draft over a live summary can still unpublish or discard", () => {
    expect(summaryActions({ hasDraft: true, hasPublished: true, live: true })).toEqual(["publish", "edit", "regenerate", "discard", "unpublish"]);
  });
  test("draft only", () => {
    expect(summaryActions({ hasDraft: true, hasPublished: false, live: false })).toEqual(["publish", "edit", "regenerate", "discard"]);
  });
  test("live, no draft", () => {
    expect(summaryActions({ hasDraft: false, hasPublished: true, live: true })).toEqual(["edit", "regenerate", "unpublish"]);
  });
  test("unpublished, no draft", () => {
    expect(summaryActions({ hasDraft: false, hasPublished: true, live: false })).toEqual(["publish", "edit", "regenerate"]);
  });
});
