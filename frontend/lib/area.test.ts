import { describe, expect, it } from "vitest";
import { areaMatches, areaSuggestionMatches, canonicalizeAreaInput, formatAreaLabel } from "./area";

describe("RentMate area presentation", () => {
  it("maps Vietnamese variants and common aliases to one canonical area", () => {
    expect(canonicalizeAreaInput("Bình Thạnh")).toBe("binh-thanh");
    expect(canonicalizeAreaInput("binh thanh")).toBe("binh-thanh");
    expect(canonicalizeAreaInput("bình-thạnh")).toBe("binh-thanh");
    expect(canonicalizeAreaInput("Q3")).toBe("quan-3");
    expect(canonicalizeAreaInput("Quận 3")).toBe("quan-3");
  });

  it("renders canonical keys as Vietnamese labels without changing unknown free text", () => {
    expect(formatAreaLabel("quan-3")).toBe("Quận 3");
    expect(formatAreaLabel("binh thanh")).toBe("Bình Thạnh");
    expect(formatAreaLabel("Khu tự nhập")).toBe("Khu tự nhập");
  });

  it("supports accent-insensitive matching without fuzzy typo guesses", () => {
    expect(areaMatches("quan-3", "Quan 3")).toBe(true);
    expect(areaMatches("Bình Thạnh", "binh-thanh")).toBe(true);
    expect(areaSuggestionMatches("Bình Thạnh", "binh")).toBe(true);
    expect(canonicalizeAreaInput("Binh Thannh")).toBe("binh-thannh");
  });
});
