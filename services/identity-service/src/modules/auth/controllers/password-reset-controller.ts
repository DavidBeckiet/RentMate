import type { RequestHandler } from "express";
import { sendNoContent, sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { PasswordResetService } from "../services/password-reset-service.js";
import {
  validatePasswordResetConfirmationBody,
  validatePasswordResetRequestBody
} from "../validations/password-reset-validation.js";

export function createPasswordResetRequestHandler(service: PasswordResetService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      await service.request(validatePasswordResetRequestBody(request.body));
      sendObject(response, { accepted: true });
    })().catch(next);
  };
}

export function createPasswordResetConfirmationHandler(service: PasswordResetService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      await service.confirm(validatePasswordResetConfirmationBody(request.body));
      sendNoContent(response);
    })().catch(next);
  };
}
