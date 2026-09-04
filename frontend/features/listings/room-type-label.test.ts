import { describe, expect, it } from "vitest";
import { propertyTypeLabel } from "./room-type-label";

describe("propertyTypeLabel", () => {
  it.each([
    ["APARTMENT", "Apartment", "Căn hộ"],
    ["DORMITORY", "Dormitory", "Ký túc xá"],
    ["HOUSE", "House", "Nhà nguyên căn"],
    ["ROOM", "Room", "Phòng trọ"],
    ["STUDIO", "Studio", "Căn studio"]
  ])("maps %s to %s without changing its API code", (code, fallback, expected) => {
    expect(propertyTypeLabel({ code, label: fallback })).toBe(expected);
  });

  it("preserves labels for unknown API codes", () => {
    expect(propertyTypeLabel({ code: "SHARED", label: "Ở ghép" })).toBe("Ở ghép");
  });
});
