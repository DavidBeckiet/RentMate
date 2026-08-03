import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal } from "../src/shared/types/authentication.js";
import type { OwnerImage } from "../src/modules/listings/owner-image-mapper.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "../src/modules/listings/owner-listing-read-service.js";
import type { OwnerListingDetailBase } from "../src/modules/listings/owner-listing-mapper.js";
import type { OwnerListingSummary } from "../src/modules/listings/owner-listing-summary-mapper.js";

const now = new Date("2026-07-29T07:15:00.000Z");
const summary = (id: number): OwnerListingSummary =>
  Object.freeze({
    id,
    status: "DRAFT",
    title: null,
    monthlyRent: null,
    areaName: null,
    propertyType: null,
    coverImage: null,
    currentModerationReason: null,
    updatedAt: now
  });

const base: OwnerListingDetailBase = Object.freeze({
  id: 42,
  status: "APPROVED",
  title: "Studio",
  description: "Description",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28.5,
  addressText: "Exact address",
  areaName: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  propertyType: Object.freeze({ code: "STUDIO", label: "Studio" }),
  createdAt: now,
  updatedAt: now
});

const image: OwnerImage = Object.freeze({
  id: 91,
  url: "https://cdn.example.test/image.webp",
  format: "webp",
  width: 800,
  height: 600,
  byteSize: 12345,
  displayOrder: 1,
  altText: null,
  createdAt: now
});

function principal(role: AuthenticatedPrincipal["role"] = "LANDLORD"): AuthenticatedPrincipal {
  return Object.freeze({ userId: 17, role });
}

function repository(overrides: Partial<OwnerListingReadRepository> = {}): OwnerListingReadRepository {
  return {
    findOwnerListingPage: vi.fn().mockResolvedValue([]),
    findOwnerListingDetailBase: vi.fn().mockResolvedValue(base),
    findAmenitiesForListing: vi.fn().mockResolvedValue([Object.freeze({ code: "WIFI", label: "Wi-Fi" })]),
    findImagesForListing: vi.fn().mockResolvedValue([image]),
    findCurrentModerationReason: vi.fn().mockResolvedValue("Current reason"),
    ...overrides
  };
}

describe("RM-021 owner listing read service", () => {
  it("uses principal ownership, pageSize plus one, trims the extra row, and preserves order", async () => {
    const rows = [summary(5), summary(4), summary(3)];
    const repo = repository({ findOwnerListingPage: vi.fn().mockResolvedValue(rows) });
    const service = createOwnerListingReadService(repo);
    const result = await service.listOwned(principal(), {
      status: "DRAFT",
      page: 2,
      pageSize: 2,
      offset: 2
    });

    expect(repo.findOwnerListingPage).toHaveBeenCalledWith({
      landlordId: 17,
      status: "DRAFT",
      limit: 3,
      offset: 2
    });
    expect(result).toStrictEqual({ summaries: [rows[0], rows[1]], page: 2, pageSize: 2, hasNextPage: true });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.summaries)).toBe(true);
  });

  it("marks a final and empty page without additional repository calls", async () => {
    const repo = repository({ findOwnerListingPage: vi.fn().mockResolvedValue([summary(1)]) });
    const service = createOwnerListingReadService(repo);
    await expect(
      service.listOwned(principal(), { status: null, page: 1, pageSize: 20, offset: 0 })
    ).resolves.toMatchObject({ hasNextPage: false, summaries: [expect.objectContaining({ id: 1 })] });
    expect(repo.findOwnerListingPage).toHaveBeenCalledOnce();
  });

  it.each(["TENANT", "ADMIN"] as const)("defensively rejects %s without repository access", async (role) => {
    const repo = repository();
    const service = createOwnerListingReadService(repo);
    await expect(
      service.listOwned(principal(role), { status: null, page: 1, pageSize: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(service.getOwnedDetail(principal(role), 42)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repo.findOwnerListingPage).not.toHaveBeenCalled();
    expect(repo.findOwnerListingDetailBase).not.toHaveBeenCalled();
  });

  it("loads ordinary detail in exactly three ordered repository operations", async () => {
    const events: string[] = [];
    const repo = repository({
      findOwnerListingDetailBase: vi.fn(async () => {
        events.push("base");
        return base;
      }),
      findAmenitiesForListing: vi.fn(async () => {
        events.push("amenities");
        return [{ code: "WIFI", label: "Wi-Fi" }];
      }),
      findImagesForListing: vi.fn(async () => {
        events.push("images");
        return [image];
      })
    });
    const detail = await createOwnerListingReadService(repo).getOwnedDetail(principal(), 42);

    expect(repo.findOwnerListingDetailBase).toHaveBeenCalledWith(42, 17);
    expect(events).toStrictEqual(["base", "amenities", "images"]);
    expect(repo.findCurrentModerationReason).not.toHaveBeenCalled();
    expect(detail).toMatchObject({ id: 42, images: [{ id: 91 }], currentModerationReason: null });
  });

  it.each(["REJECTED", "HIDDEN"] as const)("loads the current reason as the fourth query for %s", async (status) => {
    const repo = repository({ findOwnerListingDetailBase: vi.fn().mockResolvedValue({ ...base, status }) });
    const detail = await createOwnerListingReadService(repo).getOwnedDetail(principal(), 42);
    expect(repo.findCurrentModerationReason).toHaveBeenCalledWith(42, status);
    expect(detail.currentModerationReason).toBe("Current reason");
  });

  it("returns byte-identical generic not-found errors for absent/non-owned repository results", async () => {
    const repo = repository({ findOwnerListingDetailBase: vi.fn().mockResolvedValue(null) });
    const service = createOwnerListingReadService(repo);
    const errors = [];
    for (const listingId of [42, 99]) {
      try {
        await service.getOwnedDetail(principal(), listingId);
      } catch (error) {
        errors.push(error);
      }
    }
    expect(errors).toHaveLength(2);
    expect(
      errors.map((error) => ({
        code: (error as { code: string }).code,
        message: (error as Error).message,
        status: (error as { status: number }).status
      }))
    ).toStrictEqual([
      { code: "RESOURCE_NOT_FOUND", message: "The requested resource was not found.", status: 404 },
      { code: "RESOURCE_NOT_FOUND", message: "The requested resource was not found.", status: 404 }
    ]);
    expect(repo.findAmenitiesForListing).not.toHaveBeenCalled();
  });

  it("fails internally when an applicable moderation reason is missing", async () => {
    const repo = repository({
      findOwnerListingDetailBase: vi.fn().mockResolvedValue({ ...base, status: "REJECTED" }),
      findCurrentModerationReason: vi.fn().mockResolvedValue(null)
    });
    await expect(createOwnerListingReadService(repo).getOwnedDetail(principal(), 42)).rejects.toThrow(
      "Owner listing representation is invalid."
    );
  });

  it("propagates infrastructure failures without translating them to not-found", async () => {
    const failure = new Error("private database failure");
    const repo = repository({ findOwnerListingPage: vi.fn().mockRejectedValue(failure) });
    await expect(
      createOwnerListingReadService(repo).listOwned(principal(), { status: null, page: 1, pageSize: 20, offset: 0 })
    ).rejects.toBe(failure);
  });
});
