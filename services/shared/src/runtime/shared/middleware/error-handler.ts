import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";
import type { Logger } from "../logging/logger.js";

interface BodyParserError extends SyntaxError {
  status?: number;
  type?: string;
}

interface PayloadTooLargeError extends Error {
  status?: number;
  type?: string;
}

function isMalformedJson(error: unknown): error is BodyParserError {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const bodyParserError = error as BodyParserError;
  return bodyParserError.status === 400 && bodyParserError.type === "entity.parse.failed";
}

function isPayloadTooLarge(error: unknown): error is PayloadTooLargeError {
  if (!(error instanceof Error)) {
    return false;
  }

  const bodyParserError = error as PayloadTooLargeError;
  return bodyParserError.status === 413 && bodyParserError.type === "entity.too.large";
}

function sendApplicationError(
  response: Parameters<ErrorRequestHandler>[2],
  requestId: string,
  error: ApplicationError
) {
  const details = error.details.length > 0 ? { details: error.details } : {};

  response.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...details
    }
  });
}

export function unexpectedErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, next): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof ApplicationError) {
      sendApplicationError(response, request.requestId, error);
      return;
    }

    if (isMalformedJson(error)) {
      sendApplicationError(
        response,
        request.requestId,
        new ApplicationError("MALFORMED_REQUEST", "The request body contains malformed JSON.")
      );
      return;
    }

    if (isPayloadTooLarge(error)) {
      sendApplicationError(
        response,
        request.requestId,
        new ApplicationError("PAYLOAD_TOO_LARGE", "The request payload is too large.")
      );
      return;
    }

    logger.error("Unexpected request error", {
      requestId: request.requestId,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });

    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected internal failure occurred.",
        requestId: request.requestId
      }
    });
  };
}
