import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { RoommateService } from "../services/roommate-service.js";
import { parseRoommateRequestId } from "../validations/roommate-validation.js";
import {
  parseRoommateInterestId,
  validateCreateRoommateInterestBody,
  validateRoommateInterestCollectionQuery,
  validateRoommateInterestPageQuery
} from "../validations/roommate-interest-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function validateEmptyBody(value: unknown): void {
  if (value === undefined) return;
  validateBodyFields(value, []);
}

function validateEmptyQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

export function createRoommateInterestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    void service
      .createInterest(
        principal(request),
        parseRoommateRequestId(request.params.requestId),
        validateCreateRoommateInterestBody(request.body)
      )
      .then((value) => sendObject(response, value, 201))
      .catch(next);
  };
}

export function listRoommateRequestInterestsHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyBody(request.body);
    void service
      .listIncomingInterests(
        principal(request),
        parseRoommateRequestId(request.params.requestId),
        validateRoommateInterestPageQuery(request.query)
      )
      .then((page) => sendPaginated(response, page.data, page))
      .catch(next);
  };
}

export function listRoommateInterestsHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyBody(request.body);
    void service
      .listInterests(principal(request), validateRoommateInterestCollectionQuery(request.query))
      .then((page) => sendPaginated(response, page.data, page))
      .catch(next);
  };
}

export function getRoommateInterestHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .getInterest(principal(request), parseRoommateInterestId(request.params.interestId))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

function transitionHandler(
  service: RoommateService,
  transition: (principal: NonNullable<Request["auth"]>, interestId: number) => Promise<unknown>
): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void transition(principal(request), parseRoommateInterestId(request.params.interestId))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}

export function acceptRoommateInterestHandler(service: RoommateService): RequestHandler {
  return transitionHandler(service, (caller, interestId) => service.acceptInterest(caller, interestId));
}

export function rejectRoommateInterestHandler(service: RoommateService): RequestHandler {
  return transitionHandler(service, (caller, interestId) => service.rejectInterest(caller, interestId));
}

export function withdrawRoommateInterestHandler(service: RoommateService): RequestHandler {
  return transitionHandler(service, (caller, interestId) => service.withdrawInterest(caller, interestId));
}

export function leaveRoommateInterestHandler(service: RoommateService): RequestHandler {
  return transitionHandler(service, (caller, interestId) => service.leaveInterest(caller, interestId));
}

export function getCurrentRoommateConnectionHandler(service: RoommateService): RequestHandler {
  return (request, response, next) => {
    validateEmptyQuery(request.query);
    validateEmptyBody(request.body);
    void service
      .getCurrentConnection(principal(request))
      .then((value) => sendObject(response, value))
      .catch(next);
  };
}
