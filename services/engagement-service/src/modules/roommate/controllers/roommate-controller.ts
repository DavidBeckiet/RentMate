import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { RoommateService } from "../services/roommate-service.js";
import {
  parseRoommateListingId,
  parseRoommateRequestId,
  validateCreateRoommateRequestBody,
  validatePatchRoommateRequestBody,
  validateRoommateDiscoveryQuery,
  validateRoommateMineQuery,
  validateRoommateProfileBody
} from "../validations/roommate-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function validateEmptyQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

function validateEmptyBody(value: unknown): void {
  if (value === undefined) return;
  validateBodyFields(value, []);
}

export function getRoommateProfileHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .getProfile(principal(request))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function upsertRoommateProfileHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    void service
      .upsertProfile(principal(request), validateRoommateProfileBody(request.body))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function createRoommateRequestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    void service
      .createRequest(principal(request), validateCreateRoommateRequestBody(request.body))
      .then((value) => sendObject(response, value, 201))
      .catch(next);
  };
}

export function listRoommateDiscoveryHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyBody(request.body);
    void service
      .listDiscovery(principal(request), validateRoommateDiscoveryQuery(request.query))
      .then((page) => sendPaginated(response, page.data, page))
      .catch(next);
  };
}

export function listMineRoommateRequestsHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyBody(request.body);
    void service
      .listMine(principal(request), validateRoommateMineQuery(request.query))
      .then((page) => sendPaginated(response, page.data, page))
      .catch(next);
  };
}

export function getRoommateRequestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .getRequest(principal(request), parseRoommateRequestId(request.params.requestId))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function patchRoommateRequestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    void service
      .updateRequest(
        principal(request),
        parseRoommateRequestId(request.params.requestId),
        validatePatchRoommateRequestBody(request.body)
      )
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function cancelRoommateRequestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .cancelRequest(principal(request), parseRoommateRequestId(request.params.requestId))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function renewRoommateRequestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .renewRequest(principal(request), parseRoommateRequestId(request.params.requestId))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function linkRoommateListingHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    void service
      .linkListing(
        principal(request),
        parseRoommateRequestId(request.params.requestId),
        parseRoommateListingId(validateListingBody(request.body))
      )
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

function validateListingBody(value: unknown): unknown {
  const body = validateBodyFields(value, ["listingId"]);
  if (!Object.prototype.hasOwnProperty.call(body, "listingId")) {
    throwValidationIssue("listingId", "REQUIRED", "listingId is required.");
  }
  return body.listingId;
}

export function unlinkRoommateListingHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .unlinkListing(principal(request), parseRoommateRequestId(request.params.requestId))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}
