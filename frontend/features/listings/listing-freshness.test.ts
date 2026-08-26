import { describe, expect, it } from "vitest";
import { getListingFreshness, staleListingThresholdDays } from "./listing-freshness";

const now = new Date("2026-08-26T12:00:00.000Z");

describe("listing freshness", () => {
  it("describes current and recent updates without marking them stale", () => {
    expect(getListingFreshness("2026-08-26T08:00:00.000Z", now)).toMatchObject({
      daysSinceUpdate: 0,
      isStale: false,
      label: "Cập nhật hôm nay"
    });
    expect(getListingFreshness("2026-08-25T12:00:00.000Z", now)).toMatchObject({
      daysSinceUpdate: 1,
      isStale: false,
      label: "Cập nhật 1 ngày trước"
    });
  });

  it("marks listings at the configured threshold as potentially stale", () => {
    const staleAt = new Date(now.getTime() - staleListingThresholdDays * 24 * 60 * 60 * 1_000);
    expect(getListingFreshness(staleAt.toISOString(), now)).toMatchObject({
      daysSinceUpdate: staleListingThresholdDays,
      isStale: true
    });
  });

  it("fails closed for malformed timestamps", () => {
    expect(getListingFreshness("not-a-date", now)).toEqual({
      daysSinceUpdate: null,
      isStale: true,
      label: "Chưa xác định thời điểm cập nhật"
    });
  });
});
