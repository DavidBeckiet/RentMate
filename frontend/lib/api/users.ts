import type { UpdateCurrentUserBody, UserProfile } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createUsersApi(transport: ApiTransport) {
  return {
    getCurrent: (signal?: AbortSignal): Promise<UserProfile> => transport.object("/api/v1/users/me", { signal }),

    updateCurrent: (body: UpdateCurrentUserBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/users/me", { method: "PATCH", json: body, signal })
  } as const;
}
