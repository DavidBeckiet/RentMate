import { describe, expect, it } from "vitest";
import {
  evaluateComparisonNeeds,
  type ComparisonListingData,
  type ComparisonNeeds
} from "./comparison-needs-evaluator";

const listing: ComparisonListingData = {
  id: 1,
  title: "Studio Quận 3",
  monthlyRent: 4_800_000,
  roomAreaSqm: 24,
  maxOccupants: 2,
  areaName: "Quận 3",
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [
    { code: "WIFI", label: "Wi-Fi" },
    { code: "PARKING", label: "Chỗ để xe" }
  ]
};

function evaluate(needs: Partial<ComparisonNeeds>) {
  return evaluateComparisonNeeds(listing, { amenities: [], ...needs });
}

function status(needs: Partial<ComparisonNeeds>, criterion: string) {
  return evaluate(needs).find((item) => item.criterion === criterion)?.status;
}

describe("evaluateComparisonNeeds", () => {
  it("evaluates budget boundaries without a score", () => {
    expect(status({ maxMonthlyRent: 5_000_000 }, "budget")).toBe("MATCH");
    expect(status({ maxMonthlyRent: 4_000_000 }, "budget")).toBe("MISMATCH");
    expect(status({ minMonthlyRent: 4_000_000 }, "budget")).toBe("MATCH");
    expect(status({ minMonthlyRent: 5_000_000 }, "budget")).toBe("MISMATCH");
    expect(status({ minMonthlyRent: 4_000_000, maxMonthlyRent: 5_000_000 }, "budget")).toBe("MATCH");
    expect(status({ minMonthlyRent: 4_800_000, maxMonthlyRent: 4_800_000 }, "budget")).toBe("MATCH");
    expect(status({ maxMonthlyRent: 4_000_000 }, "budget")).toBe("MISMATCH");
    expect(evaluate({ maxMonthlyRent: 4_000_000 }).find((item) => item.criterion === "budget")?.explanation).toContain(
      "800.000 ₫"
    );
  });

  it("evaluates room area min, max, range, and missing values", () => {
    expect(status({ minRoomAreaSqm: 20 }, "roomArea")).toBe("MATCH");
    expect(status({ minRoomAreaSqm: 30 }, "roomArea")).toBe("MISMATCH");
    expect(status({ maxRoomAreaSqm: 25 }, "roomArea")).toBe("MATCH");
    expect(status({ maxRoomAreaSqm: 20 }, "roomArea")).toBe("MISMATCH");
    expect(status({ minRoomAreaSqm: 20, maxRoomAreaSqm: 25 }, "roomArea")).toBe("MATCH");
    expect(status({ minRoomAreaSqm: 30 }, "roomArea")).toBe("MISMATCH");
    expect(
      evaluateComparisonNeeds({ ...listing, roomAreaSqm: null }, { minRoomAreaSqm: 20, amenities: [] })[0]?.status
    ).toBe("UNKNOWN");
  });

  it("uses canonical property type equality", () => {
    expect(status({ propertyType: "studio" }, "propertyType")).toBe("MATCH");
    expect(status({ propertyType: "ROOM" }, "propertyType")).toBe("MISMATCH");
    expect(status({ propertyType: "STUDIO" }, "propertyType")).toBe("MATCH");
    expect(
      evaluateComparisonNeeds({ ...listing, propertyType: null }, { propertyType: "STUDIO", amenities: [] })[0]?.status
    ).toBe("UNKNOWN");
  });

  it("uses Search-compatible occupancy semantics and preserves unknown capacity", () => {
    expect(status({ minOccupants: 2 }, "occupancy")).toBe("MATCH");
    expect(status({ minOccupants: 3 }, "occupancy")).toBe("MISMATCH");
    expect(status({ minOccupants: 2 }, "occupancy")).toBe("MATCH");
    expect(
      evaluateComparisonNeeds({ ...listing, maxOccupants: null }, { minOccupants: 2, amenities: [] })[0]?.status
    ).toBe("UNKNOWN");
  });

  it("uses ALL semantics for amenities", () => {
    expect(status({ amenities: ["WIFI", "PARKING"] }, "amenities")).toBe("MATCH");
    expect(status({ amenities: ["WIFI", "WASHING_MACHINE"] }, "amenities")).toBe("MISMATCH");
    expect(
      evaluate({ amenities: ["WIFI", "WASHING_MACHINE", "AIR_CONDITIONING"] }).find(
        (item) => item.criterion === "amenities"
      )?.explanation
    ).toContain("Máy giặt");
    expect(status({ amenities: ["LEGACY_AMENITY"] }, "amenities")).toBe("UNKNOWN");
  });

  it("uses the shared area aliases while retaining broad free-text matching", () => {
    expect(status({ areaName: "quận 3" }, "area")).toBe("MATCH");
    expect(status({ areaName: "Quận" }, "area")).toBe("MATCH");
    expect(status({ areaName: "Quan 3" }, "area")).toBe("MATCH");
    expect(status({ areaName: "Quận 1" }, "area")).toBe("MISMATCH");
  });

  it("does not evaluate keyword, sort, geo, or create a global score", () => {
    expect(evaluate({ q: "studio có gác" })).toEqual([]);
  });
});
