import {
  NominatimClientError,
  type NominatimClient
} from "../../../../../shared/src/runtime/integrations/nominatim.client.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { ForwardGeocodingInput, ReverseGeocodingInput } from "../validations/geocoding-validation.js";

const providerUnavailableMessage = "The geocoding provider is unavailable.";

export interface GeocodingCandidate {
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface ReverseGeocodingResult {
  readonly addressText: string;
  readonly areaName: string;
}

export interface GeocodingService {
  readonly forwardGeocode: (
    principal: AuthenticatedPrincipal,
    input: ForwardGeocodingInput
  ) => Promise<readonly GeocodingCandidate[]>;
  readonly reverseGeocode: (
    principal: AuthenticatedPrincipal,
    input: ReverseGeocodingInput
  ) => Promise<ReverseGeocodingResult | null>;
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
    },

    async reverseGeocode(principal: AuthenticatedPrincipal, input: ReverseGeocodingInput) {
      if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);

      try {
        const result = await nominatimClient.reverseGeocode(input.latitude, input.longitude);
        return result
          ? Object.freeze({
              addressText: result.addressText,
              areaName: result.areaName
            })
          : null;
      } catch (error) {
        if (error instanceof NominatimClientError) {
          throw new ApplicationError("PROVIDER_UNAVAILABLE", providerUnavailableMessage);
        }

        throw error;
      }
    }
  });
}
