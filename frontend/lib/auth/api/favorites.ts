import type { ApiPage, PaginationQuery, PublicListingSummary } from "../../../types/api";
import type { ApiTransport } from "./transport";

export function createFavoritesApi(transport: ApiTransport) {
  return {
    list: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<PublicListingSummary>> =>
      transport.page("/api/v1/favorites", { query, signal }),

    add: (listingId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/favorites/${listingId}`, { method: "PUT", signal }),

    remove: (listingId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/favorites/${listingId}`, { method: "DELETE", signal })
  } as const;
}
