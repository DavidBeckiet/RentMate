import { describe, expect, it, vi } from "vitest";
import type { AdminListingDetailBase } from "../src/modules/listings/admin-listing-detail-mapper.js";
import type { AdminListingReadRepository } from "../src/modules/listings/admin-listing-read-repository.js";
import { createAdminListingReadService } from "../src/modules/listings/admin-listing-read-service.js";
import type { AdminListingSummary } from "../src/modules/listings/admin-listing-summary-mapper.js";
import type { AuthenticatedPrincipal } from "../src/shared/types/authentication.js";

const now = new Date("2026-08-09T07:15:00.000Z");
const summary = (id: number): AdminListingSummary => ({
  id,
  status: "PENDING",
  title: "Studio",
  areaName: "District 1",
  landlord: { id: 17, email: "owner@example.com", phone: "+84901234567", isActive: false },
  updatedAt: now
});
const base: AdminListingDetailBase = {
  listing: {
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
    propertyType: { code: "STUDIO", label: "Studio" },
    createdAt: now,
    updatedAt: now
  },
  landlord: { id: 17, role: "LANDLORD", email: "owner@example.com", phone: "+84901234567", isActive: false }
};

function principal(role: AuthenticatedPrincipal["role"] = "ADMIN"): AuthenticatedPrincipal {
  return { userId: 3, role };
}

function repository(overrides: Partial<AdminListingReadRepository> = {}): AdminListingReadRepository {
  return {
    findListingPage: vi.fn().mockResolvedValue([]),
    findListingDetailBase: vi.fn().mockResolvedValue(base),
    findAmenitiesForListing: vi.fn().mockResolvedValue([]),
    findImagesForListing: vi.fn().mockResolvedValue([]),
    findCurrentModerationReason: vi.fn().mockResolvedValue("Latest"),
    listingExists: vi.fn().mockResolvedValue(true),
    findModerationHistoryPage: vi.fn().mockResolvedValue([]),
    ...overrides
  };
}

describe("RM-041 admin listing read service", () => {
  it("uses pageSize plus one and trims the queue without applying landlord activity", async () => {
    const rows = [summary(3), summary(2), summary(1)];
    const repo = repository({ findListingPage: vi.fn().mockResolvedValue(rows) });
    const page = await createAdminListingReadService(repo).listAdminListings(principal(), {
      status: "PENDING",
      page: 2,
      pageSize: 2,
      offset: 2
    });
    expect(repo.findListingPage).toHaveBeenCalledWith({ status: "PENDING", limit: 3, offset: 2 });
    expect(page).toStrictEqual({ summaries: rows.slice(0, 2), page: 2, pageSize: 2, hasNextPage: true });
    expect(page.summaries[0]?.landlord.isActive).toBe(false);
  });

  it.each(["TENANT", "LANDLORD"] as const)("defensively rejects %s before repository access", async (role) => {
    const repo = repository();
    const service = createAdminListingReadService(repo);
    await expect(
      service.listAdminListings(principal(role), { status: "PENDING", page: 1, pageSize: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.getAdminListingDetail(principal(role), 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.listModerationHistory(principal(role), 42, { page: 1, pageSize: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.findListingPage).not.toHaveBeenCalled();
    expect(repo.findListingDetailBase).not.toHaveBeenCalled();
    expect(repo.listingExists).not.toHaveBeenCalled();
  });

  it("uses exactly three detail operations for ordinary status and one for missing", async () => {
    const repo = repository();
    const detail = await createAdminListingReadService(repo).getAdminListingDetail(principal(), 42);
    expect(detail).toMatchObject({ id: 42, landlord: { isActive: false }, currentModerationReason: null });
    expect(repo.findListingDetailBase).toHaveBeenCalledOnce();
    expect(repo.findAmenitiesForListing).toHaveBeenCalledOnce();
    expect(repo.findImagesForListing).toHaveBeenCalledOnce();
    expect(repo.findCurrentModerationReason).not.toHaveBeenCalled();

    const missing = repository({ findListingDetailBase: vi.fn().mockResolvedValue(null) });
    await expect(createAdminListingReadService(missing).getAdminListingDetail(principal(), 99)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404
    });
    expect(missing.findAmenitiesForListing).not.toHaveBeenCalled();
  });

  it.each(["REJECTED", "HIDDEN"] as const)("uses current status for the fourth %s reason operation", async (status) => {
    const repo = repository({
      findListingDetailBase: vi.fn().mockResolvedValue({ ...base, listing: { ...base.listing, status } })
    });
    const detail = await createAdminListingReadService(repo).getAdminListingDetail(principal(), 42);
    expect(repo.findCurrentModerationReason).toHaveBeenCalledWith(42, status);
    expect(detail.currentModerationReason).toBe("Latest");
  });

  it("returns 404 after one history operation or trims page after exactly two", async () => {
    const missing = repository({ listingExists: vi.fn().mockResolvedValue(false) });
    await expect(
      createAdminListingReadService(missing).listModerationHistory(principal(), 99, {
        page: 1,
        pageSize: 20,
        offset: 0
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(missing.findModerationHistoryPage).not.toHaveBeenCalled();

    const items = [
      {
        id: 3,
        listingId: 42,
        adminId: 1,
        previousStatus: "PENDING" as const,
        newStatus: "APPROVED" as const,
        reason: null,
        createdAt: now
      },
      {
        id: 2,
        listingId: 42,
        adminId: 1,
        previousStatus: "PENDING" as const,
        newStatus: "REJECTED" as const,
        reason: "x",
        createdAt: now
      }
    ];
    const repo = repository({ findModerationHistoryPage: vi.fn().mockResolvedValue(items) });
    const page = await createAdminListingReadService(repo).listModerationHistory(principal(), 42, {
      page: 1,
      pageSize: 1,
      offset: 0
    });
    expect(repo.findModerationHistoryPage).toHaveBeenCalledWith({ listingId: 42, limit: 2, offset: 0 });
    expect(page).toMatchObject({ items: [items[0]], hasNextPage: true });
  });

  it("preserves the corrupted current-reason invariant", async () => {
    const repo = repository({
      findListingDetailBase: vi.fn().mockResolvedValue({ ...base, listing: { ...base.listing, status: "REJECTED" } }),
      findCurrentModerationReason: vi.fn().mockResolvedValue(null)
    });
    await expect(createAdminListingReadService(repo).getAdminListingDetail(principal(), 42)).rejects.toThrow(
      "Admin listing detail representation is invalid."
    );
  });
});
