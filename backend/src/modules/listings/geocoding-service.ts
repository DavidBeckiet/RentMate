import { NominatimClientError, type NominatimClient } from "../../integrations/nominatim.client.js";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../shared/types/authentication.js";
import type { ForwardGeocodingInput } from "./geocoding-validation.js";

const providerUnavailableMessage = "The geocoding provider is unavailable.";

export interface GeocodingCandidate {
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeocodingService {
  readonly forwardGeocode: (
    principal: AuthenticatedPrincipal,
    input: ForwardGeocodingInput
  ) => Promise<readonly GeocodingCandidate[]>;
}

export function createGeocodingService(nominatimClient: NominatimClient): GeocodingService {
  return Object.freeze({
    async forwardGeocode(principal: AuthenticatedPrincipal, input: ForwardGeocodingInput) {
      if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);

      try {
        const candidates = await nominatimClient.forwardGeocode(input.addressText);
        return Object.freeze(
          candidates.map((candidate) =>
            Object.freeze({
              displayName: candidate.displayName,
              latitude: candidate.latitude,
              longitude: candidate.longitude
            })
          )
        );
      } catch (error) {
        if (error instanceof NominatimClientError) {
          throw new ApplicationError("PROVIDER_UNAVAILABLE", providerUnavailableMessage);
        }

        throw error;
      }
    }
  });
}
