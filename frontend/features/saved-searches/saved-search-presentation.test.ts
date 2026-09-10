import { describe, expect, it } from "vitest";
import type { SavedSearchQuery } from "../../types/api";
import {
  formatSavedSearchArea,
  formatSavedSearchBudget,
  generateSavedSearchName,
  savedSearchCriteria
} from "./saved-search-presentation";

const ordinary: SavedSearchQuery = {
  q: null,
  areaName: null,
  minMonthlyRent: null,
  maxMonthlyRent: null,
  minRoomAreaSqm: null,
  maxRoomAreaSqm: null,
  minOccupants: null,
  propertyType: null,
  amenities: [],
  mode: "ordinary",
  north: null,
  south: null,
  east: null,
  west: null,
  centerLat: null,
  centerLng: null,
  radiusKm: null,
  sort: "newest"
};

describe("saved search presentation", () => {
  it("formats open, exact, and above-slider budget ranges without losing high values", () => {
    expect(formatSavedSearchBudget({ minMonthlyRent: null, maxMonthlyRent: 5_000_000 })).toBe("Dưới 5 triệu/tháng");
    expect(formatSavedSearchBudget({ minMonthlyRent: 5_000_000, maxMonthlyRent: 5_000_000 })).toBe("5 triệu/tháng");
    expect(formatSavedSearchBudget({ minMonthlyRent: 20_000_000, maxMonthlyRent: null })).toBe("Từ 20 triệu/tháng");
  });

  it("formats open and custom room-area ranges factually", () => {
    expect(formatSavedSearchArea({ minRoomAreaSqm: null, maxRoomAreaSqm: 19.99 })).toBe("Dưới 19,99 m²");
    expect(formatSavedSearchArea({ minRoomAreaSqm: 22.5, maxRoomAreaSqm: 31.25 })).toBe("22,5–31,25 m²");
    expect(formatSavedSearchArea({ minRoomAreaSqm: 60, maxRoomAreaSqm: null })).toBe("Từ 60 m²");
  });

  it("uses only active criteria and readable labels", () => {
    const criteria = savedSearchCriteria({
      ...ordinary,
      q: "studio có gác",
      areaName: "Quận 3",
      propertyType: "STUDIO",
      amenities: ["WIFI", "WASHING_MACHINE"],
      minOccupants: 2,
      minMonthlyRent: 3_000_000,
      maxMonthlyRent: 5_000_000,
      sort: "rent_asc"
    });

    expect(criteria).toEqual([
      "Quận 3",
      "3 triệu–5 triệu/tháng",
      "Căn studio",
      "Từ 2 người",
      "Wi-Fi · Máy giặt",
      "Từ khóa: studio có gác",
      "Giá thấp đến cao"
    ]);
    expect(criteria.join(" ")).not.toMatch(/STUDIO|WASHING_MACHINE/);
  });

  it("generates a deterministic name and falls back without exposing an id", () => {
    expect(generateSavedSearchName({ ...ordinary, areaName: "Quận 3", propertyType: "STUDIO" })).toBe(
      "Căn studio Quận 3"
    );
    expect(generateSavedSearchName(ordinary)).toBe("Tìm kiếm đã lưu");
  });

  it("hides historical lookup and sort codes instead of leaking them", () => {
    const criteria = savedSearchCriteria({
      ...ordinary,
      propertyType: "LEGACY_TYPE",
      amenities: ["LEGACY_AMENITY"],
      sort: "legacy_sort" as never
    });

    expect(criteria).toEqual(["Tất cả tin đăng mới nhất"]);
    expect(criteria.join(" ")).not.toMatch(/LEGACY_TYPE|LEGACY_AMENITY|legacy_sort/);
  });
});
