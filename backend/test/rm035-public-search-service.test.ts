import { describe, expect, it, vi } from "vitest";
import type { PublicListingSearchRepository } from "../src/modules/listings/public-listing-search-repository.js";
import { createPublicListingSearchService } from "../src/modules/listings/public-listing-search-service.js";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";

function repository(overrides: Partial<PublicListingSearchRepository> = {}): PublicListingSearchRepository {
  return {
    findKnownSearchCodes: vi.fn(async () => ({ propertyTypes: ["STUDIO"], amenities: ["PARKING", "WIFI"] })),
    findOrdinaryPage: vi.fn(async () => []),
    ...overrides
  };
}

const summary = (id: number) =>
  ({
    id,
    title: `Listing ${id}`,
    monthlyRent: 1,
    roomAreaSqm: 1,
    areaName: "Area",
    latitude: 10,
    longitude: 106,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    coverImage: { url: "https://example.test/image", altText: null, displayOrder: 1 },
    updatedAt: "2026-01-01T00:00:00.000Z"
  }) as const;

describe("RM-035 public listing search service", () => {
  it("uses one ordinary query and no catalog query without controlled filters", async () => {
    const repo = repository();
    const page = await createPublicListingSearchService(repo).search(validatePublicListingSearch({}));
    expect(page).toStrictEqual({ summaries: [], page: 1, pageSize: 20, hasNextPage: false });
    expect(repo.findKnownSearchCodes).not.toHaveBeenCalled();
    expect(repo.findOrdinaryPage).toHaveBeenCalledOnce();
  });

  it("uses one combined validation call for known, including retired, controlled codes", async () => {
    const repo = repository();
    await createPublicListingSearchService(repo).search(
      validatePublicListingSearch({ propertyType: "studio", amenities: "wifi,parking" })
    );
    expect(repo.findKnownSearchCodes).toHaveBeenCalledOnce();
    expect(repo.findKnownSearchCodes).toHaveBeenCalledWith({ propertyType: "STUDIO", amenities: ["PARKING", "WIFI"] });
    expect(repo.findOrdinaryPage).toHaveBeenCalledOnce();
  });

  it.each([
    [{ propertyType: "OTHER" }, { propertyTypes: [], amenities: [] }, "propertyType"],
    [{ amenities: "OTHER" }, { propertyTypes: [], amenities: [] }, "amenities"]
  ] as const)("rejects unknown controlled codes before search", async (query, known, field) => {
    const repo = repository({ findKnownSearchCodes: vi.fn(async () => known) });
    await expect(
      createPublicListingSearchService(repo).search(validatePublicListingSearch(query))
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [expect.objectContaining({ field })]
    });
    expect(repo.findOrdinaryPage).not.toHaveBeenCalled();
  });

  it("trims the sentinel and computes hasNextPage", async () => {
    const repo = repository({ findOrdinaryPage: vi.fn(async () => [summary(1), summary(2), summary(3)]) });
    const page = await createPublicListingSearchService(repo).search(validatePublicListingSearch({ pageSize: "2" }));
    expect(page.summaries.map((item) => item.id)).toStrictEqual([1, 2]);
    expect(page.hasNextPage).toBe(true);
  });

  it.each([
    { north: "11", south: "10", east: "107", west: "106" },
    { centerLat: "10", centerLng: "106", radiusKm: "5" }
  ])("gates a valid geographic mode before every repository call", async (query) => {
    const repo = repository();
    await expect(
      createPublicListingSearchService(repo).search(validatePublicListingSearch(query))
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [
        expect.objectContaining({
          field: "query",
          code: "INVALID_VALUE",
          message: "The requested geographic search mode is not available."
        })
      ]
    });
    expect(repo.findKnownSearchCodes).not.toHaveBeenCalled();
    expect(repo.findOrdinaryPage).not.toHaveBeenCalled();
  });
});
