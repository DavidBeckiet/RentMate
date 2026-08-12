import type { Amenity, PropertyType } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createLookupsApi(transport: ApiTransport) {
  return {
    listPropertyTypes: (signal?: AbortSignal): Promise<readonly PropertyType[]> =>
      transport.object("/api/v1/lookups/property-types", { signal }),

    listAmenities: (signal?: AbortSignal): Promise<readonly Amenity[]> =>
      transport.object("/api/v1/lookups/amenities", { signal })
  } as const;
}
