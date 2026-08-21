import type {
  ActivationBody,
  AdminListingDetail,
  AdminListingQuery,
  AdminListingSummary,
  AdminUserQuery,
  ApiPage,
  ModerationBody,
  ModerationHistoryItem,
  PaginationQuery,
  UserProfile
} from "../../../types/api";
import type { ApiTransport } from "./transport";

export function createAdminApi(transport: ApiTransport) {
  return {
    listListings: (query: AdminListingQuery = {}, signal?: AbortSignal): Promise<ApiPage<AdminListingSummary>> =>
      transport.page("/api/v1/admin/listings", { query, signal }),

    getListing: (listingId: number, signal?: AbortSignal): Promise<AdminListingDetail> =>
      transport.object(`/api/v1/admin/listings/${listingId}`, { signal }),

    listHistory: (
      listingId: number,
      query: PaginationQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<ModerationHistoryItem>> =>
      transport.page(`/api/v1/admin/listings/${listingId}/moderation-actions`, { query, signal }),

    moderate: (listingId: number, body: ModerationBody, signal?: AbortSignal): Promise<ModerationHistoryItem> =>
      transport.object(`/api/v1/admin/listings/${listingId}/moderation-actions`, {
        method: "POST",
        json: body,
        signal
      }),

    listUsers: (query: AdminUserQuery = {}, signal?: AbortSignal): Promise<ApiPage<UserProfile>> =>
      transport.page("/api/v1/admin/users", { query, signal }),

    setActivation: (userId: number, body: ActivationBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object(`/api/v1/admin/users/${userId}/activation`, { method: "PATCH", json: body, signal })
  } as const;
}
