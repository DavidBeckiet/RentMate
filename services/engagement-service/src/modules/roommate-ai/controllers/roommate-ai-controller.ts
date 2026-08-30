import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { RoommateAiCapabilityService } from "../services/roommate-ai-capability-service.js";
import type { RoommateAiPreferencePreviewService } from "../services/preference-preview-service.js";
import type { RoommateAiRecommendationService } from "../services/recommendation-service.js";
import type { RoommateAiCompatibilityExplanationService } from "../services/compatibility-explanation-service.js";
import { validateRoommateAiPreferencePreviewBody } from "../validations/preference-preview-validation.js";
import { validateRoommateAiRecommendationBody } from "../validations/recommendation-validation.js";
import { validateRoommateAiExplanationBody } from "../validations/explanation-validation.js";
import { parseRoommateRequestId } from "../../roommate/validations/roommate-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function getRoommateAiCapabilitiesHandler(service: RoommateAiCapabilityService): RequestHandler {
  return (request, response, next) => {
    try {
      validateQueryKeys(request.query, []);
      if (request.body !== undefined) validateBodyFields(request.body, []);
      sendObject(response, service.getCapabilities(principal(request)));
    } catch (error) {
      next(error);
    }
  };
}

export function createRoommateAiPreferencePreviewHandler(service: RoommateAiPreferencePreviewService): RequestHandler {
  return (request, response, next) => {
    try {
      validateQueryKeys(request.query, []);
      const input = validateRoommateAiPreferencePreviewBody(request.body);
      void service
        .preview(principal(request), input)
        .then((result) => sendObject(response, result))
        .catch(next);
    } catch (error) {
      next(error);
    }
  };
}

export function createRoommateAiRecommendationsHandler(service: RoommateAiRecommendationService): RequestHandler {
  return (request, response, next) => {
    try {
      validateQueryKeys(request.query, []);
      const input = validateRoommateAiRecommendationBody(request.body);
      void service
        .recommend(principal(request), input)
        .then((result) => sendObject(response, result))
        .catch(next);
    } catch (error) {
      next(error);
    }
  };
}

export function createRoommateAiExplanationHandler(service: RoommateAiCompatibilityExplanationService): RequestHandler {
  return (request, response, next) => {
    try {
      validateQueryKeys(request.query, []);
      const input = validateRoommateAiExplanationBody(request.body);
      void service
        .explain(principal(request), parseRoommateRequestId(request.params.requestId), input)
        .then((result) => sendObject(response, result))
        .catch(next);
    } catch (error) {
      next(error);
    }
  };
}
