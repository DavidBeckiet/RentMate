import type { PublicListingSummary } from "./public-listing-summary.js";

export interface ListingCatalogClientOptions {
  readonly baseUrl: string;
  readonly internalToken: string;
  readonly fetcher?: typeof fetch;
}

export interface ListingCatalogClient {
  readonly loadPublicSummariesByIds: (listingIds: readonly number[]) => Promise<readonly PublicListingSummary[]>;
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
    Array.isArray(summary.amenities)
  );
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
      return Object.freeze([...summaries]);
    }
  });
}
