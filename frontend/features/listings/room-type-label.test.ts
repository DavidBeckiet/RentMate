import { describe, expect, it } from "vitest";
import { amenityIcon, amenityLabel, propertyTypeLabel } from "./room-type-label";

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

describe("amenityLabel", () => {
  it.each([
    ["AIR_CONDITIONING", "Air conditioning", "Điều hòa"],
    ["WIFI", "Wi-Fi", "Wi-Fi"],
    ["FURNISHED", "Furnished", "Có nội thất"],
    ["PRIVATE_BATHROOM", "Private bathroom", "Phòng tắm riêng"],
    ["KITCHEN", "Kitchen", "Khu bếp"],
    ["REFRIGERATOR", "Refrigerator", "Tủ lạnh"],
    ["WASHING_MACHINE", "Washing machine", "Máy giặt"],
    ["PARKING", "Parking", "Chỗ để xe"],
    ["ELEVATOR", "Elevator", "Thang máy"],
    ["SECURITY", "Security", "An ninh"],
    ["BALCONY", "Balcony", "Ban công"],
    ["PET_FRIENDLY", "Pet friendly", "Cho phép thú cưng"]
  ])("maps %s to a Vietnamese public label", (code, fallback, expected) => {
    expect(amenityLabel({ code, label: fallback })).toBe(expected);
  });

  it("preserves a human-readable label for an unknown API code", () => {
    expect(amenityLabel({ code: "OTHER", label: "Other" })).toBe("Other");
    expect(amenityLabel({ code: "OLD_WIFI", label: "Wi-Fi cũ" })).toBe("Wi-Fi cũ");
  });

  it("turns enum-like unknown labels into readable fallback text", () => {
    expect(amenityLabel({ code: "OLD_WIFI", label: "OLD_WIFI" })).toBe("Old wifi");
    expect(amenityLabel({ code: "OTHER", label: "" })).toBe("Other");
    expect(amenityLabel({ code: "", label: "OTHER" })).toBe("Tiện ích");
  });
});

describe("amenityIcon", () => {
  it.each([
    ["AIR_CONDITIONING", "snowflake"],
    ["WIFI", "wifi"],
    ["FURNISHED", "home"],
    ["PRIVATE_BATHROOM", "bath"],
    ["KITCHEN", "utensils"],
    ["REFRIGERATOR", "refrigerator"],
    ["WASHING_MACHINE", "washingMachine"],
    ["PARKING", "car"],
    ["ELEVATOR", "building"],
    ["SECURITY", "shield"],
    ["BALCONY", "building"],
    ["PET_FRIENDLY", "paw"]
  ])("uses the semantic %s icon", (code, expected) => {
    expect(amenityIcon({ code, label: code })).toBe(expected);
  });

  it("uses a safe home icon for unknown amenities", () => {
    expect(amenityIcon({ code: "OTHER", label: "Other" })).toBe("home");
  });
});
