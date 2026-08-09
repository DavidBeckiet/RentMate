import { describe, expect, it, vi } from "vitest";
import type { MappedPublicListingDetailResult } from "../src/modules/listings/public-listing-detail-mapper.js";
import type { PublicListingDetailRepository } from "../src/modules/listings/public-listing-detail-repository.js";
import { createPublicListingDetailService } from "../src/modules/listings/public-listing-detail-service.js";

const detail = Object.freeze({
  id: 42,
  title: "Studio",
  description: "Description",
  monthlyRent: 7500000,
  roomAreaSqm: 28.5,
  areaName: "District 1",
  latitude: 10.773,
  longitude: 106.698,
  propertyType: Object.freeze({ code: "STUDIO", label: "Studio" }),
  amenities: Object.freeze([]),
  images: Object.freeze([{ url: "https://cdn.example.test/a.webp", altText: null, displayOrder: 1 }]),
  updatedAt: "2026-07-29T07:15:00.000Z"
});

function repository(result: MappedPublicListingDetailResult | null): PublicListingDetailRepository {
  return { findPublicDetailById: vi.fn(async () => result) };
}

describe("RM-037 public listing detail service", () => {
  it("maps every missing or non-public target to the same resource-not-found error", async () => {
    const service = createPublicListingDetailService(repository(null));
    await expect(service.getPublicDetail(42)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
      message: "The requested resource was not found."
    });
  });

  it.each([
    ["anonymous", undefined],
    ["landlord", { userId: 17, role: "LANDLORD" as const }],
    ["admin", { userId: 3, role: "ADMIN" as const }]
  ])("uses the base branch for %s", async (_label, principal) => {
    const repo = repository({ detail, landlordContact: null });
    const mapped = await createPublicListingDetailService(repo).getPublicDetail(42, principal);
    expect(repo.findPublicDetailById).toHaveBeenCalledOnce();
    expect(repo.findPublicDetailById).toHaveBeenCalledWith(42, false);
    expect(mapped).toBe(detail);
    expect(mapped).not.toHaveProperty("landlordContact");
  });

  it("uses one contact-inclusive repository call only for TENANT", async () => {
    const repo = repository({
      detail,
      landlordContact: { email: "owner@example.com", phone: "+84901234567" }
    });
    const mapped = await createPublicListingDetailService(repo).getPublicDetail(42, {
      userId: 9,
      role: "TENANT"
    });
    expect(repo.findPublicDetailById).toHaveBeenCalledOnce();
    expect(repo.findPublicDetailById).toHaveBeenCalledWith(42, true);
    expect(mapped).toStrictEqual({ ...detail, landlordContact: { email: "owner@example.com", phone: "+84901234567" } });
  });

  it("rejects missing tenant contact and unexpected base contact as internal invariants", async () => {
    await expect(
      createPublicListingDetailService(repository({ detail, landlordContact: null })).getPublicDetail(42, {
        userId: 9,
        role: "TENANT"
      })
    ).rejects.toThrow("missing landlord contact");
    await expect(
      createPublicListingDetailService(
        repository({ detail, landlordContact: { email: "owner@example.com", phone: "+84901234567" } })
      ).getPublicDetail(42)
    ).rejects.toThrow("unexpectedly contains landlord contact");
  });

  it("propagates repository failures", async () => {
    const failure = new Error("private database failure");
    const repo: PublicListingDetailRepository = {
      findPublicDetailById: vi.fn(async () => Promise.reject(failure))
    };
    await expect(createPublicListingDetailService(repo).getPublicDetail(42)).rejects.toBe(failure);
  });
});
