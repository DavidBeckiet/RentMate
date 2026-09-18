import { describe, expect, it } from "vitest";
import type { OwnerListingDetail, OwnerListingSummary } from "../../types/api";
import { getDraftRequirements, resolveOwnerWorkspaceMode, selectProgressListing } from "./owner-workspace-state";

function listing(id: number, status: OwnerListingSummary["status"]): OwnerListingSummary {
  return {
    id,
    status,
    businessStatus: "UNKNOWN",
    title: null,
    monthlyRent: null,
    maxOccupants: null,
    areaName: null,
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: null,
    coverImage: null,
    currentModerationReason: null,
    updatedAt: "2026-09-01T00:00:00.000Z"
  };
}

function draftDetail(overrides: Partial<OwnerListingDetail> = {}): OwnerListingDetail {
  return {
    id: 1,
    status: "DRAFT",
    businessStatus: "UNKNOWN",
    title: null,
    description: null,
    monthlyRent: null,
    roomAreaSqm: null,
    maxOccupants: null,
    addressText: null,
    areaName: null,
    latitude: null,
    longitude: null,
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: null,
    amenities: [],
    images: [],
    currentModerationReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides
  };
}

describe("owner workspace state", () => {
  it("uses State A only when the current owned inventory is empty", () => {
    expect(resolveOwnerWorkspaceMode(0, undefined)).toBe("EMPTY");
    expect(resolveOwnerWorkspaceMode(0, { hasEverApprovedListing: true })).toBe("EMPTY");
  });

  it.each(["DRAFT", "PENDING", "REJECTED"] as const)(
    "selects State B for a %s listing when owner-wide approval history is false",
    (status) => {
      const current = listing(1, status);
      expect(resolveOwnerWorkspaceMode(1, { hasEverApprovedListing: false })).toBe("GETTING_LISTING_LIVE");
      expect(selectProgressListing([current])?.status).toBe(status);
    }
  );

  it.each(["DRAFT", "PENDING"] as const)(
    "selects State C for a current %s listing after historical approval",
    (status) => {
      expect(resolveOwnerWorkspaceMode(1, { hasEverApprovedListing: true })).toBe("OPERATING");
      expect(selectProgressListing([listing(1, status)])?.status).toBe(status);
    }
  );

  it("prioritizes rejected listings, then drafts, then pending listings", () => {
    expect(selectProgressListing([listing(1, "PENDING"), listing(2, "DRAFT"), listing(3, "REJECTED")])?.id).toBe(3);
    expect(selectProgressListing([listing(1, "PENDING"), listing(2, "DRAFT")])?.id).toBe(2);
    expect(selectProgressListing([listing(1, "PENDING")])?.id).toBe(1);
  });

  it.each([undefined, null, {}, { hasEverApprovedListing: "false" }])(
    "uses a neutral fallback instead of treating missing/invalid metadata as State B (%s)",
    (metadata) => {
      expect(resolveOwnerWorkspaceMode(1, metadata)).toBe("UNKNOWN");
    }
  );

  it("derives the draft checklist from the server's required content and persisted-image rules", () => {
    const incomplete = getDraftRequirements(draftDetail({ title: "Phòng gần công viên", monthlyRent: 6_000_000 }));
    expect(incomplete.filter((requirement) => !requirement.complete).map((requirement) => requirement.key)).toEqual([
      "propertyType",
      "description",
      "roomAreaSqm",
      "addressText",
      "areaName",
      "coordinates",
      "images"
    ]);

    const complete = getDraftRequirements(
      draftDetail({
        title: "Phòng gần công viên",
        description: "Căn phòng nhiều ánh sáng.",
        monthlyRent: 6_000_000,
        roomAreaSqm: 24,
        addressText: "12 Example Street",
        areaName: "Bình Thạnh",
        latitude: 10.8,
        longitude: 106.7,
        propertyType: { code: "STUDIO", label: "Studio" },
        images: [
          {
            id: 1,
            url: "https://example.com/room.webp",
            format: "webp",
            width: 1200,
            height: 900,
            byteSize: 1200,
            displayOrder: 1,
            altText: null,
            createdAt: "2026-09-01T00:00:00.000Z"
          }
        ]
      })
    );
    expect(complete.every((requirement) => requirement.complete)).toBe(true);
  });
});
