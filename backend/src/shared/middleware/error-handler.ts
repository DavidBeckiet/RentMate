import type { ErrorRequestHandler } from "express";
import type { Logger } from "../logging/logger.js";

interface BodyParserError extends SyntaxError {
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

export function unexpectedErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, next): void => {
    void next;

    if (isMalformedJson(error)) {
      response.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "The request contains invalid data.",
          requestId: request.requestId
        }
      });
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
