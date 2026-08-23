import type { ListingNote } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createListingNotesApi(transport: ApiTransport) {
  return {
    list: (listingIds: readonly number[], signal?: AbortSignal): Promise<readonly ListingNote[]> =>
      transport.object("/api/v1/tenant/listing-notes", { query: { listingIds }, signal }),

    save: (listingId: number, note: string, signal?: AbortSignal): Promise<ListingNote> =>
      transport.object(`/api/v1/tenant/listing-notes/${listingId}`, {
        method: "PUT",
        json: { note },
        signal
      }),

    remove: (listingId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/tenant/listing-notes/${listingId}`, { method: "DELETE", signal })
  } as const;
}
