import type { Amenity, PropertyType, PublicAreaSuggestions } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createLookupsApi(transport: ApiTransport) {
  return {
    listPropertyTypes: (signal?: AbortSignal): Promise<readonly PropertyType[]> =>
      transport.object("/api/v1/lookups/property-types", { signal }),

    listAmenities: (signal?: AbortSignal): Promise<readonly Amenity[]> =>
      transport.object("/api/v1/lookups/amenities", { signal }),

    listPublicAreas: async (signal?: AbortSignal): Promise<readonly string[]> => {
      const response = await transport.object<PublicAreaSuggestions>("/api/v1/listings/areas", { signal });
      return response.areas;
    }
  } as const;
}
