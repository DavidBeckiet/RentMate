import { describe, expect, it, vi } from "vitest";
import type { FavoriteRepository } from "../src/modules/favorites/favorite-repository.js";
import { createFavoriteService } from "../src/modules/favorites/favorite-service.js";
import type { PublicListingSummary } from "../src/modules/listings/public-listing-summary-mapper.js";

const tenant = Object.freeze({ userId: 7, role: "TENANT" as const });

function summary(id: number): PublicListingSummary {
  return Object.freeze({
    id,
    title: `Listing ${id}`,
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    areaName: "District 1",
    latitude: 10.773,
    longitude: 106.698,
    propertyType: Object.freeze({ code: "STUDIO", label: "Studio" }),
    amenities: Object.freeze([]),
    coverImage: Object.freeze({ url: "https://cdn.example.test/cover.webp", altText: null, displayOrder: 1 }),
    updatedAt: "2026-08-01T07:15:00.000Z"
  });
}

function repository(): FavoriteRepository {
  return {
    findPage: vi.fn(async () => []),
    ensurePresent: vi.fn(async () => ({ isVisible: true, wasInserted: true })),
    ensureAbsent: vi.fn(async () => 0)
  };
}

describe("RM-039 favorite service", () => {
  it("trims limit-plus-one and derives pagination without a count", async () => {
    const repo = repository();
    vi.mocked(repo.findPage).mockResolvedValue([summary(3), summary(2), summary(1)]);
    const page = await createFavoriteService(repo).listFavorites(tenant, { page: 2, pageSize: 2, offset: 2 });
    expect(page).toStrictEqual({ summaries: [summary(3), summary(2)], page: 2, pageSize: 2, hasNextPage: true });
    expect(repo.findPage).toHaveBeenCalledOnce();
    expect(repo.findPage).toHaveBeenCalledWith({ tenantId: 7, pageSize: 2, offset: 2 });
  });

  it.each(["LANDLORD", "ADMIN"] as const)("defensively rejects %s without repository access", async (role) => {
    const repo = repository();
    await expect(
      createFavoriteService(repo).listFavorites({ userId: 8, role }, { page: 1, pageSize: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repo.findPage).not.toHaveBeenCalled();
  });

  it("treats first and repeated visible PUT as success", async () => {
    const repo = repository();
    const service = createFavoriteService(repo);
    await expect(service.ensureFavoritePresent(tenant, 42)).resolves.toBeUndefined();
    vi.mocked(repo.ensurePresent).mockResolvedValue({ isVisible: true, wasInserted: false });
    await expect(service.ensureFavoritePresent(tenant, 42)).resolves.toBeUndefined();
    expect(repo.ensurePresent).toHaveBeenNthCalledWith(1, 7, 42);
    expect(repo.ensurePresent).toHaveBeenNthCalledWith(2, 7, 42);
  });

  it("maps every non-public PUT target to generic 404", async () => {
    const repo = repository();
    vi.mocked(repo.ensurePresent).mockResolvedValue({ isVisible: false, wasInserted: false });
    await expect(createFavoriteService(repo).ensureFavoritePresent(tenant, 42)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
      message: "The requested resource was not found."
    });
  });

  it.each([0, 1])("treats DELETE row count %i as success", async (rowCount) => {
    const repo = repository();
    vi.mocked(repo.ensureAbsent).mockResolvedValue(rowCount);
    await expect(createFavoriteService(repo).ensureFavoriteAbsent(tenant, 42)).resolves.toBeUndefined();
    expect(repo.ensureAbsent).toHaveBeenCalledWith(7, 42);
  });
});
