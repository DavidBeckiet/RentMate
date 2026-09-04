import { describe, expect, it } from "vitest";
import {
  formatNearMeDistance,
  formatNearMePopupRent,
  formatNearMeRadius,
  formatNearMeRent,
  formatNearMeResultSummary
} from "./near-me-format";

describe("near-me presentation formatters", () => {
  it("keeps price labels compact and readable on map markers", () => {
    expect(formatNearMeRent(4_200_000)).toBe("4,2tr");
    expect(formatNearMeRent(5_000_000)).toBe("5tr");
    expect(formatNearMeRent(12_000_000)).toBe("12tr");
  });

  it("uses a compact monthly price label inside the listing popup", () => {
    expect(formatNearMePopupRent(4_200_000)).toBe("4,2 triệu/tháng");
    expect(formatNearMePopupRent(5_000_000)).toBe("5 triệu/tháng");
    expect(formatNearMePopupRent(12_000_000)).toBe("12 triệu/tháng");
  });

  it("shows short distances in meters and longer distances in kilometers", () => {
    expect(formatNearMeDistance(0.45)).toBe("450 m");
    expect(formatNearMeDistance(0.834729)).toBe("0,8 km");
    expect(formatNearMeDistance(2.3)).toBe("2,3 km");
  });

  it("uses the committed radius in result summaries, including zero results", () => {
    expect(formatNearMeRadius(5)).toBe("5");
    expect(formatNearMeResultSummary(3, 5)).toBe("Tìm thấy 3 phòng trong bán kính 5 km.");
    expect(formatNearMeResultSummary(0, 10)).toBe("Không tìm thấy phòng trong bán kính 10 km.");
  });
});
