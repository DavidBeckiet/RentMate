import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { LandlordVerification } from "../repositories/verification-repository.js";
import type { VerificationService } from "../services/verification-service.js";
import {
  parseVerificationId,
  validateCreateVerificationBody,
  validateReviewVerificationBody,
  validateVerificationCollectionQuery
} from "../validations/verification-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}
function landlordDto(verification: LandlordVerification) {
  return {
    id: verification.id,
    displayName: verification.displayName,
    requestNote: verification.requestNote,
    status: verification.status,
    decisionNote: verification.decisionNote,
    submittedAt: verification.submittedAt,
    reviewedAt: verification.reviewedAt
  };
}
function adminDto(verification: LandlordVerification) {
  return {
    ...landlordDto(verification),
    landlord: verification.landlord,
    reviewedByAdminId: verification.reviewedByAdminId,
    updatedAt: verification.updatedAt
  };
}

export function createSubmitVerificationHandler(service: VerificationService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        landlordDto(await service.create(principal(request), validateCreateVerificationBody(request.body))),
        201
      );
    })().catch(next);
  };
}
export function createGetCurrentVerificationHandler(service: VerificationService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      const verification = await service.current(principal(request));
      sendObject(response, verification === null ? null : landlordDto(verification));
    })().catch(next);
  };
}
export function createListVerificationsHandler(service: VerificationService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const page = await service.list(principal(request), validateVerificationCollectionQuery(request.query));
      sendPaginated(response, page.data.map(adminDto), page);
    })().catch(next);
  };
}
export function createGetVerificationHandler(service: VerificationService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        adminDto(await service.get(principal(request), parseVerificationId(request.params.verificationId)))
      );
    })().catch(next);
  };
}
export function createReviewVerificationHandler(service: VerificationService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        adminDto(
          await service.review(
            principal(request),
            parseVerificationId(request.params.verificationId),
            validateReviewVerificationBody(request.body)
          )
        )
      );
    })().catch(next);
  };
}
