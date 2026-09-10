import { describe, expect, it } from "vitest";
import { normalizeReviewPage } from "./review-page-utils";

describe("normalizeReviewPage", () => {
  it.each([
    [undefined, 1],
    ["", 1],
    ["bad", 1],
    ["0", 1],
    ["-2", 1],
    ["1", 1],
    ["2", 2],
    ["10", 10],
    ["100000", 100000]
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeReviewPage(value)).toBe(expected);
  });
});
