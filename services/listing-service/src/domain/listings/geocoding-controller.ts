import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject } from "../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../shared/src/runtime/shared/middleware/authentication.js";
import { validateQueryKeys } from "../../../../shared/src/runtime/shared/validation/request.js";
import type { GeocodingService } from "./geocoding-service.js";
import { validateForwardGeocodingInput, type ForwardGeocodingInput } from "./geocoding-validation.js";

interface GeocodingLocals {
  forwardGeocodingInput?: ForwardGeocodingInput;
}

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function createForwardGeocodingValidationPreflightHandler(): RequestHandler {
  return (request, response, next): void => {
    try {
      validateQueryKeys(request.query, []);
      (response.locals as GeocodingLocals).forwardGeocodingInput = validateForwardGeocodingInput(request.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createForwardGeocodingHandler(service: GeocodingService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const input = (response.locals as GeocodingLocals).forwardGeocodingInput;
      if (!input) throw new Error("Forward-geocoding validation preflight is unavailable.");
      const candidates = await service.forwardGeocode(principal, input);
      sendObject(
        response,
        candidates.map((candidate) => ({
          displayName: candidate.displayName,
          latitude: candidate.latitude,
          longitude: candidate.longitude
        }))
      );
    })().catch(next);
  };
}
