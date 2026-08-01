import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { sendObject } from "../src/shared/http/responses.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";
import { normalizeEmail } from "../src/shared/validation/normalization.js";
import { parsePagination } from "../src/shared/validation/parsing.js";
import { validateBodyFields, validateQueryKeys } from "../src/shared/validation/request.js";

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

function createSyntheticApp(logger: Logger): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.post("/synthetic/body", (incomingRequest, response) => {
    const body = validateBodyFields(incomingRequest.body, ["email"]);
    sendObject(response, { email: normalizeEmail(body.email) });
  });
  app.get("/synthetic/query", (incomingRequest, response) => {
    const query = validateQueryKeys(incomingRequest.query, ["page", "pageSize"]);
    sendObject(response, parsePagination(query));
  });
  app.get("/synthetic/known", () => {
    throw new ApplicationError("RESOURCE_NOT_FOUND", "The requested resource was not found.", {
      cause: new Error("private SQL cause")
    });
  });
  app.get("/synthetic/unexpected", () => {
    throw new Error("SELECT password_hash FROM users; JWT=private; Cookie=private");
  });
  app.get("/synthetic/syntax-error", () => {
    throw new SyntaxError("not a body-parser error");
  });
  app.get("/synthetic/thrown-value", () => {
    throw { privateProviderResponse: "must-not-appear" };
  });
  app.use(unexpectedErrorHandler(logger));

  return app;
}

function expectRequestId(body: unknown): string {
  const requestId = (body as { error: { requestId: string } }).error.requestId;
  expect(requestId).toMatch(/^req_[a-f0-9]{32}$/);
  return requestId;
}

describe("RM-010 centralized error middleware", () => {
  it("returns a known application error envelope without cause, stack, or details when empty", async () => {
    const logger = createLoggerMock();
    const response = await request(createSyntheticApp(logger)).get("/synthetic/known");
    const requestId = expectRequestId(response.body);

    expect(response.status).toBe(404);
    expect(response.body).toStrictEqual({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found.",
        requestId
      }
    });
    expect(response.text).not.toContain("cause");
    expect(response.text).not.toContain("SQL");
    expect(response.text).not.toContain("stack");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns ordered validation details for well-formed invalid input without logging it as unexpected", async () => {
    const logger = createLoggerMock();
    const response = await request(createSyntheticApp(logger))
      .post("/synthetic/body")
      .send({ zeta: "private-z", alpha: "private-a" });
    const requestId = expectRequestId(response.body);

    expect(response.status).toBe(422);
    expect(response.body).toStrictEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "The request contains invalid data.",
        requestId,
        details: [
          { field: "alpha", code: "UNKNOWN_FIELD", message: "alpha is not an allowed body field." },
          { field: "zeta", code: "UNKNOWN_FIELD", message: "zeta is not an allowed body field." }
        ]
      }
    });
    expect(response.text).not.toContain("private-a");
    expect(response.text).not.toContain("private-z");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns 422 for unknown, repeated, and invalid query values", async () => {
    const app = createSyntheticApp(createLoggerMock());

    const unknown = await request(app).get("/synthetic/query?unexpected=private");
    const repeated = await request(app).get("/synthetic/query?page=1&page=2");
    const invalid = await request(app).get("/synthetic/query?page=1e2");

    for (const response of [unknown, repeated, invalid]) {
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expectRequestId(response.body);
    }
    expect(unknown.text).not.toContain("private");
  });

  it("recognizes only the Express malformed-JSON shape and returns sanitized 400", async () => {
    const response = await request(createSyntheticApp(createLoggerMock()))
      .post("/synthetic/body")
      .set("Content-Type", "application/json")
      .send('{"email":"private@example.com"');
    const requestId = expectRequestId(response.body);

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({
      error: {
        code: "MALFORMED_REQUEST",
        message: "The request body contains malformed JSON.",
        requestId
      }
    });
    expect(response.text).not.toContain("private@example.com");
    expect(response.text).not.toContain("Unexpected end");
  });

  it("returns sanitized 413 for an oversized JSON payload without echoing the body", async () => {
    const privatePayload = `private-${"x".repeat(110 * 1024)}`;
    const response = await request(createSyntheticApp(createLoggerMock()))
      .post("/synthetic/body")
      .send({ email: privatePayload });
    const requestId = expectRequestId(response.body);

    expect(response.status).toBe(413);
    expect(response.body).toStrictEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "The request payload is too large.",
        requestId
      }
    });
    expect(response.text).not.toContain("private-");
  });

  it.each(["/synthetic/unexpected", "/synthetic/thrown-value"])(
    "sanitizes unknown failure from %s and logs only structured type context",
    async (path) => {
      const logger = createLoggerMock();
      const response = await request(createSyntheticApp(logger)).get(path);
      const requestId = expectRequestId(response.body);

      expect(response.status).toBe(500);
      expect(response.body).toStrictEqual({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected internal failure occurred.",
          requestId
        }
      });

      const publicAndLogged = `${response.text}${JSON.stringify(logger.error.mock.calls)}`;
      for (const privateText of [
        "password_hash",
        "JWT=private",
        "Cookie=private",
        "privateProviderResponse",
        "must-not-appear",
        "stack"
      ]) {
        expect(publicAndLogged).not.toContain(privateText);
      }
      expect(logger.error).toHaveBeenCalledWith("Unexpected request error", {
        requestId,
        errorType: path.endsWith("unexpected") ? "Error" : "UnknownError"
      });
    }
  );

  it("does not classify an arbitrary SyntaxError as malformed JSON", async () => {
    const response = await request(createSyntheticApp(createLoggerMock())).get("/synthetic/syntax-error");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.text).not.toContain("not a body-parser error");
  });

  it("delegates to Express when headers have already been sent", () => {
    const error = new Error("controlled");
    const next = vi.fn() as NextFunction;
    const response = { headersSent: true } as Response;
    const incomingRequest = { requestId: "req_controlled" } as Request;

    unexpectedErrorHandler(createLoggerMock())(error, incomingRequest, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe("RM-010 health exception", () => {
  it("preserves exact healthy and unavailable responses without envelopes", async () => {
    const healthy = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: createLoggerMock(),
      checkDatabaseConnection: async () => undefined
    });
    const unavailable = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: createLoggerMock(),
      checkDatabaseConnection: async () => {
        throw new Error("controlled unavailable");
      }
    });

    await request(healthy).get("/api/health").expect(200, { status: "ok", database: "connected" });
    await request(unavailable).get("/api/health").expect(503, {
      status: "error",
      database: "unavailable"
    });
  });
});
