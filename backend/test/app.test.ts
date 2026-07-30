import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";
import { requestLoggerMiddleware } from "../src/shared/middleware/request-logger.js";

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

describe("GET /api/health", () => {
  it("returns the exact connected response when PostgreSQL is available", async () => {
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: createLoggerMock(),
      checkDatabaseConnection: vi.fn().mockResolvedValue(undefined)
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      status: "ok",
      database: "connected"
    });
  });

  it("returns the exact unavailable response without touching a real database", async () => {
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: createLoggerMock(),
      checkDatabaseConnection: vi.fn().mockRejectedValue(new Error("controlled database failure"))
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toStrictEqual({
      status: "error",
      database: "unavailable"
    });
  });
});

describe("request middleware", () => {
  it("propagates one generated request ID through handlers, logs, and sanitized errors", async () => {
    const logger = createLoggerMock();
    const app = express();
    let downstreamRequestId: string | undefined;
    const internalDetails = [
      "private internal failure",
      "SELECT secret FROM private_table",
      "DATABASE_PASSWORD=not-public",
      "Cookie: rentmate_session=not-public",
      "JWT=not-public",
      "requestBody={private:true}"
    ].join(" | ");

    app.use(requestIdMiddleware);
    app.use(requestLoggerMiddleware(logger));
    app.get("/verification-only", (request) => {
      downstreamRequestId = request.requestId;
      throw new Error(internalDetails);
    });
    app.use(unexpectedErrorHandler(logger));

    const response = await request(app).get("/verification-only");
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    const body = response.body as {
      error: {
        code: string;
        message: string;
        requestId: string;
      };
    };

    expect(response.status).toBe(500);
    expect(body.error).toStrictEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal failure occurred.",
      requestId: body.error.requestId
    });
    expect(body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
    expect(downstreamRequestId).toBe(body.error.requestId);

    const requestLog = logger.info.mock.calls.find(([message]) => message === "HTTP request completed");
    const errorLog = logger.error.mock.calls.find(([message]) => message === "Unexpected request error");

    expect(requestLog?.[1]).toMatchObject({ requestId: body.error.requestId, status: 500 });
    expect(errorLog?.[1]).toMatchObject({ requestId: body.error.requestId, errorType: "Error" });

    const publicResponse = response.text;
    const serializedLogs = JSON.stringify({
      info: logger.info.mock.calls,
      error: logger.error.mock.calls
    });

    for (const privateValue of [internalDetails, "private_table", "not-public", "requestBody", "stack"]) {
      expect(publicResponse).not.toContain(privateValue);
      expect(serializedLogs).not.toContain(privateValue);
    }
  });
});
