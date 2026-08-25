import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendNoContent, sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { AnalyticsService } from "../services/analytics-service.js";
import {
  parseAnalyticsListingId,
  validateAnalyticsQuery,
  validateTrackAnalyticsEventBody
} from "../validations/analytics-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function createGetLandlordAnalyticsHandler(service: AnalyticsService): RequestHandler {
  return (request, response, next) => {
    void service
      .get(principal(request), validateAnalyticsQuery(request.query))
      .then((analytics) => sendObject(response, analytics))
      .catch(next);
  };
}

export function createTrackAnalyticsEventHandler(service: AnalyticsService): RequestHandler {
  return (request, response, next) => {
    void service
      .trackEvent(
        request.auth,
        parseAnalyticsListingId(request.params.listingId),
        validateTrackAnalyticsEventBody(request.body)
      )
      .then(() => sendNoContent(response))
      .catch(next);
  };
}
