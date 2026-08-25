import type { RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type {
  ContactVerificationService,
  ContactVerificationStatusResult
} from "../services/contact-verification-service.js";
import {
  validateConfirmEmailVerificationBody,
  validateConfirmPhoneVerificationBody
} from "../validations/verification-validation.js";

function principal(request: Parameters<RequestHandler>[0]): NonNullable<typeof request.auth> {
  if (!request.auth)
    throw new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required to access this resource.");
  return request.auth;
}

function dto(value: ContactVerificationStatusResult) {
  return Object.freeze({
    email: Object.freeze({
      address: value.email.address,
      verified: value.email.verifiedAt !== null,
      verifiedAt: value.email.verifiedAt
    }),
    phone: Object.freeze({
      number: value.phone.number,
      verified: value.phone.verifiedAt !== null,
      verifiedAt: value.phone.verifiedAt
    }),
    profile: value.profile
      ? Object.freeze({
          id: value.profile.id,
          displayName: value.profile.displayName,
          requestNote: value.profile.requestNote,
          status: value.profile.status,
          decisionNote: value.profile.decisionNote,
          submittedAt: value.profile.submittedAt,
          reviewedAt: value.profile.reviewedAt
        })
      : null
  });
}

function validateEmptyBody(value: unknown): void {
  validateBodyFields(value, []);
}

export function createGetContactVerificationStatusHandler(service: ContactVerificationService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const current = principal(request);
      validateQueryKeys(request.query, []);
      sendObject(response, dto(await service.status(current)));
    })().catch(next);
  };
}

export function createRequestEmailVerificationHandler(service: ContactVerificationService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const current = principal(request);
      validateQueryKeys(request.query, []);
      validateEmptyBody(request.body);
      sendObject(response, dto(await service.requestEmail(current)));
    })().catch(next);
  };
}

export function createConfirmEmailVerificationHandler(service: ContactVerificationService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const current = principal(request);
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        dto(await service.confirmEmail(current, validateConfirmEmailVerificationBody(request.body)))
      );
    })().catch(next);
  };
}

export function createRequestPhoneVerificationHandler(service: ContactVerificationService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const current = principal(request);
      validateQueryKeys(request.query, []);
      validateEmptyBody(request.body);
      sendObject(response, dto(await service.requestPhone(current)));
    })().catch(next);
  };
}

export function createConfirmPhoneVerificationHandler(service: ContactVerificationService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const current = principal(request);
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        dto(await service.confirmPhone(current, validateConfirmPhoneVerificationBody(request.body)))
      );
    })().catch(next);
  };
}
