import { describe, expect, it, vi } from "vitest";
import type { PublicListingSearchRepository } from "../src/modules/listings/public-listing-search-repository.js";
import {
  createPublicListingSearchService,
  type PublicListingSearchConfig
} from "../src/modules/listings/public-listing-search-service.js";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";

function repository(overrides: Partial<PublicListingSearchRepository> = {}): PublicListingSearchRepository {
  return {
    findKnownSearchCodes: vi.fn(async () => ({ propertyTypes: ["STUDIO"], amenities: ["WIFI"] })),
    findOrdinaryPage: vi.fn(async () => []),
    findBoundsPage: vi.fn(async () => []),
    findRadiusPage: vi.fn(async () => []),
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
    latitude: 10.773,
    longitude: 106.698,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    coverImage: { url: "https://example.test/image", altText: null, displayOrder: 1 },
    updatedAt: "2026-01-01T00:00:00.000Z"
  }) as const;

const radiusSummary = (id: number) => ({ ...summary(id), distanceKm: id / 100 });

const config: PublicListingSearchConfig = Object.freeze({
  deploymentRegion: "HO_CHI_MINH_CITY_VN",
  maximumSearchRadiusKm: 50
});

function radiusQuery(radiusKm: number, centerLat = 10.772341, centerLng = 106.697912, pageSize?: number) {
  return validatePublicListingSearch({
    centerLat: String(centerLat),
    centerLng: String(centerLng),
    radiusKm: String(radiusKm),
    ...(pageSize === undefined ? {} : { pageSize: String(pageSize) })
  });
}

describe("RM-036 public listing search service", () => {
  it("dispatches bounds to the bounds repository without adding distance", async () => {
    const repo = repository({ findBoundsPage: vi.fn(async () => [summary(2)]) });
    const page = await createPublicListingSearchService(repo, config).search(
      validatePublicListingSearch({ north: "11", south: "10", east: "107", west: "106" })
    );

    expect(page.summaries).toStrictEqual([summary(2)]);
    expect(repo.findBoundsPage).toHaveBeenCalledOnce();
    expect(repo.findOrdinaryPage).not.toHaveBeenCalled();
    expect(repo.findRadiusPage).not.toHaveBeenCalled();
    expect(page.summaries[0]).not.toHaveProperty("distanceKm");
  });

  it("checks the injected maximum, accepts both maximum boundaries, and trims the radius sentinel", async () => {
    const repo = repository({
      findRadiusPage: vi.fn(async () => [radiusSummary(1), radiusSummary(2), radiusSummary(3)])
    });
    const service = createPublicListingSearchService(repo, config);

    await expect(service.search(radiusQuery(49.999, 10.772341, 106.697912, 2))).resolves.toMatchObject({
      hasNextPage: true
    });
    await expect(service.search(radiusQuery(50, 10.772341, 106.697912, 2))).resolves.toMatchObject({
      hasNextPage: true
    });
    expect(repo.findRadiusPage).toHaveBeenCalledTimes(2);

    const rejectingRepo = repository();
    await expect(
      createPublicListingSearchService(rejectingRepo, config).search(radiusQuery(50.001))
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [expect.objectContaining({ field: "radiusKm", code: "OUT_OF_RANGE" })]
    });
    expect(rejectingRepo.findKnownSearchCodes).not.toHaveBeenCalled();
    expect(rejectingRepo.findRadiusPage).not.toHaveBeenCalled();

    const customMaximumRepo = repository();
    const customConfig = { ...config, maximumSearchRadiusKm: 1 } as const;
    await expect(
      createPublicListingSearchService(customMaximumRepo, customConfig).search(radiusQuery(1.001))
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [expect.objectContaining({ field: "radiusKm", code: "OUT_OF_RANGE" })]
    });
    expect(customMaximumRepo.findRadiusPage).not.toHaveBeenCalled();
  });

  it.each([
    [10.772341, 106.697912],
    [Number("10.633333333333333"), 106.697912],
    [Number("11.166666666666667"), 106.697912],
    [10.772341, Number("106.36666666666666")],
    [10.772341, Number("106.93333333333334")]
  ])("accepts center on or inside the inclusive HCMC deployment rectangle (%s, %s)", async (centerLat, centerLng) => {
    const repo = repository();
    await expect(
      createPublicListingSearchService(repo, config).search(radiusQuery(1, centerLat, centerLng))
    ).resolves.toMatchObject({
      page: 1
    });
    expect(repo.findRadiusPage).toHaveBeenCalledOnce();
  });

  it.each([
    [Number("10.633333333332"), 106.697912],
    [Number("11.166666666668"), 106.697912],
    [10.772341, Number("106.366666666665")],
    [10.772341, Number("106.933333333335")]
  ])(
    "rejects center outside the inclusive HCMC deployment rectangle (%s, %s) before repository work",
    async (centerLat, centerLng) => {
      const repo = repository();
      await expect(
        createPublicListingSearchService(repo, config).search(radiusQuery(1, centerLat, centerLng))
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        details: [
          expect.objectContaining({
            field: "query",
            code: "INVALID_VALUE",
            message: "Radius center is outside the supported deployment area."
          })
        ]
      });
      expect(repo.findKnownSearchCodes).not.toHaveBeenCalled();
      expect(repo.findRadiusPage).not.toHaveBeenCalled();
    }
  );

  it("validates controlled codes after radius policy and passes the calculated box to the repository", async () => {
    const repo = repository({ findKnownSearchCodes: vi.fn(async () => ({ propertyTypes: [], amenities: [] })) });
    await expect(
      createPublicListingSearchService(repo, config).search(
        validatePublicListingSearch({
          centerLat: "10.772341",
          centerLng: "106.697912",
          radiusKm: "5",
          propertyType: "OTHER"
        })
      )
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [expect.objectContaining({ field: "propertyType" })]
    });
    expect(repo.findKnownSearchCodes).toHaveBeenCalledOnce();
    expect(repo.findRadiusPage).not.toHaveBeenCalled();

    const successfulRepo = repository({ findRadiusPage: vi.fn(async () => []) });
    const query = radiusQuery(5);
    await createPublicListingSearchService(successfulRepo, config).search(query);
    expect(successfulRepo.findRadiusPage).toHaveBeenCalledWith(
      query,
      expect.objectContaining({
        south: expect.any(Number),
        north: expect.any(Number),
        west: expect.any(Number),
        east: expect.any(Number)
      })
    );
  });
});
