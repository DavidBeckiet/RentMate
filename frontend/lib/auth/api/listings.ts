import type {
  ApiPage,
  ForwardGeocodeBody,
  GeocodingCandidate,
  ListingContentBody,
  OwnedListingQuery,
  OwnerImage,
  OwnerListingDetail,
  OwnerListingSummary,
  PublicListingDetail,
  PublicListingSearchQuery,
  PublicListingSummary,
  ReorderImagesBody,
  UploadImageInput
} from "../../../types/api";
import type { ApiTransport } from "./transport";

function imageFormData(input: UploadImageInput): FormData {
  const formData = new FormData();
  formData.append("image", input.image);
  if (input.altText !== undefined) formData.append("altText", input.altText);
  return formData;
}

export function createListingsApi(transport: ApiTransport) {
  return {
    searchPublic: (
      query: PublicListingSearchQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<PublicListingSummary>> => transport.page("/api/v1/listings", { query, signal }),

    getPublicDetail: (listingId: number, signal?: AbortSignal): Promise<PublicListingDetail> =>
      transport.object(`/api/v1/listings/${listingId}`, { signal }),

    createDraft: (body: ListingContentBody = {}, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object("/api/v1/landlord/listings", { method: "POST", json: body, signal }),

    listOwned: (query: OwnedListingQuery = {}, signal?: AbortSignal): Promise<ApiPage<OwnerListingSummary>> =>
      transport.page("/api/v1/landlord/listings", { query, signal }),

    getOwned: (listingId: number, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object(`/api/v1/landlord/listings/${listingId}`, { signal }),

    updateOwned: (listingId: number, body: ListingContentBody, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object(`/api/v1/landlord/listings/${listingId}`, { method: "PATCH", json: body, signal }),

    confirmAvailability: (listingId: number, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object(`/api/v1/landlord/listings/${listingId}/confirm-availability`, {
        method: "POST",
        signal
      }),

    deleteOwned: (listingId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/landlord/listings/${listingId}`, { method: "DELETE", signal }),

    submit: (listingId: number, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object(`/api/v1/landlord/listings/${listingId}/submit`, { method: "POST", signal }),

    deactivate: (listingId: number, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object(`/api/v1/landlord/listings/${listingId}/deactivate`, { method: "POST", signal }),

    reactivate: (listingId: number, signal?: AbortSignal): Promise<OwnerListingDetail> =>
      transport.object(`/api/v1/landlord/listings/${listingId}/reactivate`, { method: "POST", signal }),

    uploadImage: (listingId: number, input: UploadImageInput, signal?: AbortSignal): Promise<OwnerImage> =>
      transport.object(`/api/v1/landlord/listings/${listingId}/images`, {
        method: "POST",
        formData: imageFormData(input),
        signal
      }),

    deleteImage: (listingId: number, imageId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/landlord/listings/${listingId}/images/${imageId}`, { method: "DELETE", signal }),

    reorderImages: (listingId: number, body: ReorderImagesBody, signal?: AbortSignal): Promise<readonly OwnerImage[]> =>
      transport.object(`/api/v1/landlord/listings/${listingId}/images/order`, { method: "PUT", json: body, signal }),

    forwardGeocode: (body: ForwardGeocodeBody, signal?: AbortSignal): Promise<readonly GeocodingCandidate[]> =>
      transport.object("/api/v1/geocoding/forward", { method: "POST", json: body, signal })
  } as const;
}
