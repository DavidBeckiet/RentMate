import type { PublicListingSummary } from "./public-listing-summary.js";
import { isListingBusinessStatus } from "./listing-business-status.js";
import { assertPublicInquiryTarget, type PublicInquiryTarget } from "./public-inquiry-target.js";

export interface ListingCatalogClientOptions {
  readonly baseUrl: string;
  readonly internalToken: string;
  readonly fetcher?: typeof fetch;
}

export interface ListingCatalogClient {
  readonly loadPublicSummariesByIds: (listingIds: readonly number[]) => Promise<readonly PublicListingSummary[]>;
  readonly loadPublicInquiryTarget: (listingId: number) => Promise<PublicInquiryTarget | null>;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function isPublicListingSummary(value: unknown): value is PublicListingSummary {
  if (typeof value !== "object" || value === null) return false;
  const summary = value as Partial<PublicListingSummary>;
  return (
    Number.isSafeInteger(summary.id) &&
    (summary.id ?? 0) > 0 &&
    isListingBusinessStatus(summary.businessStatus) &&
    typeof summary.title === "string" &&
    typeof summary.monthlyRent === "number" &&
    typeof summary.roomAreaSqm === "number" &&
    typeof summary.areaName === "string" &&
    typeof summary.latitude === "number" &&
    typeof summary.longitude === "number" &&
    typeof summary.updatedAt === "string" &&
    typeof summary.propertyType === "object" &&
    summary.propertyType !== null &&
    typeof summary.coverImage === "object" &&
    summary.coverImage !== null &&
    Array.isArray(summary.amenities) &&
    (summary.landlordVerified === undefined || typeof summary.landlordVerified === "boolean")
  );
}

function mapPublicListingSummary(summary: PublicListingSummary): PublicListingSummary {
  return Object.freeze({
    id: summary.id,
    businessStatus: summary.businessStatus,
    title: summary.title,
    monthlyRent: summary.monthlyRent,
    roomAreaSqm: summary.roomAreaSqm,
    areaName: summary.areaName,
    latitude: summary.latitude,
    longitude: summary.longitude,
    propertyType: Object.freeze({ code: summary.propertyType.code, label: summary.propertyType.label }),
    amenities: Object.freeze(
      summary.amenities.map((amenity) => Object.freeze({ code: amenity.code, label: amenity.label }))
    ),
    coverImage: Object.freeze({
      url: summary.coverImage.url,
      altText: summary.coverImage.altText,
      displayOrder: summary.coverImage.displayOrder
    }),
    ...(summary.landlordVerified === undefined ? {} : { landlordVerified: summary.landlordVerified }),
    updatedAt: summary.updatedAt
  });
}

export function createListingCatalogClient(options: ListingCatalogClientOptions): ListingCatalogClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));

  return Object.freeze({
    async loadPublicSummariesByIds(listingIds: readonly number[]): Promise<readonly PublicListingSummary[]> {
      if (listingIds.length === 0) return Object.freeze([]);
      let response: Response;
      try {
        const query = new URLSearchParams({ ids: [...listingIds].join(",") });
        response = await fetcher(`${baseUrl}/internal/v1/listings/public-summaries?${query.toString()}`, {
          method: "GET",
          headers: { "x-rentmate-internal-token": options.internalToken }
        });
      } catch {
        throw new Error("Listing service catalog lookup failed.");
      }

      if (!response.ok) throw new Error("Listing service catalog lookup failed.");
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Listing service catalog response is invalid.");
      }
      if (typeof payload !== "object" || payload === null || !("data" in payload)) {
        throw new Error("Listing service catalog response is invalid.");
      }
      const summaries = (payload as { readonly data: unknown }).data;
      if (!Array.isArray(summaries) || summaries.some((summary) => !isPublicListingSummary(summary))) {
        throw new Error("Listing service catalog response is invalid.");
      }
      return Object.freeze(summaries.map(mapPublicListingSummary));
    },

    async loadPublicInquiryTarget(listingId: number): Promise<PublicInquiryTarget | null> {
      let response: Response;
      try {
        const query = new URLSearchParams({ ids: String(listingId) });
        response = await fetcher(`${baseUrl}/internal/v1/listings/public-inquiry-targets?${query.toString()}`, {
          method: "GET",
          headers: { "x-rentmate-internal-token": options.internalToken }
        });
      } catch {
        throw new Error("Listing service inquiry target lookup failed.");
      }

      if (!response.ok) throw new Error("Listing service inquiry target lookup failed.");
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Listing service inquiry target response is invalid.");
      }
      if (typeof payload !== "object" || payload === null || !("data" in payload)) {
        throw new Error("Listing service inquiry target response is invalid.");
      }
      const targets = (payload as { readonly data: unknown }).data;
      if (!Array.isArray(targets)) throw new Error("Listing service inquiry target response is invalid.");
      const target = targets.find((value) => {
        try {
          return assertPublicInquiryTarget(value).listingId === listingId;
        } catch {
          return false;
        }
      });
      return target === undefined ? null : assertPublicInquiryTarget(target);
    }
  });
}
