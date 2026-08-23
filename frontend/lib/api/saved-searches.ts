import type {
  ApiPage,
  CreateSavedSearchBody,
  PaginationQuery,
  SavedSearch,
  UpdateSavedSearchBody
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createSavedSearchApi(transport: ApiTransport) {
  return {
    create: (body: CreateSavedSearchBody, signal?: AbortSignal): Promise<SavedSearch> =>
      transport.object("/api/v1/saved-searches", { method: "POST", json: body, signal }),
    list: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<SavedSearch>> =>
      transport.page("/api/v1/saved-searches", { query, signal }),
    update: (id: number, body: UpdateSavedSearchBody, signal?: AbortSignal): Promise<SavedSearch> =>
      transport.object(`/api/v1/saved-searches/${id}`, { method: "PATCH", json: body, signal }),
    remove: (id: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/saved-searches/${id}`, { method: "DELETE", signal })
  } as const;
}
