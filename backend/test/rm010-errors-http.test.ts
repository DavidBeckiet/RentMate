import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  applicationErrorStatus,
  createValidationError,
  validationErrorMessage,
  type ValidationDetail
} from "../src/shared/errors/application-error.js";
import { sendNoContent, sendObject, sendPaginated } from "../src/shared/http/responses.js";

describe("RM-010 frozen application error model", () => {
  it("derives every frozen code/status mapping", () => {
    expect(applicationErrorStatus).toStrictEqual({
      VALIDATION_FAILED: 422,
      AUTHENTICATION_REQUIRED: 401,
      INVALID_CREDENTIALS: 401,
      FORBIDDEN: 403,
      RESOURCE_NOT_FOUND: 404,
      EMAIL_ALREADY_EXISTS: 409,
      INVALID_LISTING_TRANSITION: 409,
      CONCURRENT_MODIFICATION: 409,
      LISTING_DELETE_NOT_ALLOWED: 409,
      IMAGE_LIMIT_EXCEEDED: 422,
      LAST_IMAGE_REQUIRED: 422,
      UNSUPPORTED_IMAGE_TYPE: 415,
      RATE_LIMITED: 429,
      PROVIDER_UNAVAILABLE: 502,
      MALFORMED_REQUEST: 400,
      PAYLOAD_TOO_LARGE: 413,
      DEPENDENCY_UNAVAILABLE: 503,
      INTERNAL_SERVER_ERROR: 500
    });

    for (const [code, status] of Object.entries(applicationErrorStatus)) {
      expect(new ApplicationError(code as keyof typeof applicationErrorStatus, "Safe message").status).toBe(status);
    }
  });

  it("creates immutable validation details with the exact generic message", () => {
    const source: ValidationDetail[] = [{ field: "email", code: "INVALID_VALUE", message: "email is invalid." }];
    const error = createValidationError(source);
    source[0] = { field: "changed", code: "REQUIRED", message: "changed" };

    expect(error).toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422,
      message: validationErrorMessage,
      details: [{ field: "email", code: "INVALID_VALUE", message: "email is invalid." }]
    });
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(Object.isFrozen(error.details[0])).toBe(true);
  });
});

describe("RM-010 success response helpers", () => {
  const app = express();

  app.get("/object", (_request, response) => {
    sendObject(response, { id: 42 });
  });
  app.post("/created", (_request, response) => {
    sendObject(response, { id: 43 }, 201);
  });
  app.get("/paginated", (_request, response) => {
    sendPaginated(response, [{ id: 1 }], { page: 1, pageSize: 20, hasNextPage: false });
  });
  app.delete("/no-content", (_request, response) => {
    sendNoContent(response);
  });

  it("sends the exact object envelope for 200 and 201", async () => {
    const ok = await request(app).get("/object");
    const created = await request(app).post("/created");

    expect(ok.status).toBe(200);
    expect(ok.body).toStrictEqual({ data: { id: 42 } });
    expect(created.status).toBe(201);
    expect(created.body).toStrictEqual({ data: { id: 43 } });
  });

  it("sends the exact pagination envelope without counts or arbitrary metadata", async () => {
    const response = await request(app).get("/paginated");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      data: [{ id: 1 }],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });

  it("sends a real 204 with no body", async () => {
    const response = await request(app).delete("/no-content");

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(response.headers["content-type"]).toBeUndefined();
  });
});
