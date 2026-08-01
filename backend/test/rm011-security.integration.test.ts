import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { cookieParserMiddleware } from "../src/shared/middleware/cookie-parser.js";
import { createCorsMiddleware } from "../src/shared/middleware/cors.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import { createOriginGuard } from "../src/shared/middleware/origin-guard.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";
import { requestLoggerMiddleware } from "../src/shared/middleware/request-logger.js";

const configuredOrigin = "http://localhost:3000";
const probePath = "/api/v1/rm011-probe";
const unsafeMethods = ["post", "put", "patch", "delete"] as const;

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

function createTestApp(
  options: {
    readonly logger?: Logger;
    readonly checkDatabaseConnection?: () => Promise<void>;
  } = {}
) {
  return createApp({
    frontendOrigin: configuredOrigin,
    logger: options.logger ?? createLoggerMock(),
    checkDatabaseConnection: options.checkDatabaseConnection ?? (async () => undefined)
  });
}

function sendUnsafe(app: express.Express, method: (typeof unsafeMethods)[number], origin?: string) {
  const senders = {
    post: () => request(app).post(probePath),
    put: () => request(app).put(probePath),
    patch: () => request(app).patch(probePath),
    delete: () => request(app).delete(probePath)
  };
  const pendingRequest = senders[method]();

  return origin === undefined ? pendingRequest : pendingRequest.set("Origin", origin);
}

function expectForbiddenOrigin(response: Awaited<ReturnType<ReturnType<typeof request>["get"]>>): void {
  const requestId = (response.body as { error: { requestId: string } }).error.requestId;

  expect(response.status).toBe(403);
  expect(requestId).toMatch(/^req_[a-f0-9]{32}$/);
  expect(response.body).toStrictEqual({
    error: {
      code: "FORBIDDEN",
      message: "The request origin is not allowed.",
      requestId
    }
  });
}

describe("RM-011 exact credential-aware CORS", () => {
  it("keeps a safe request without Origin usable and grants no CORS permission", async () => {
    const response = await request(createTestApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("grants credentials only to the exact configured Origin", async () => {
    const allowed = await request(createTestApp()).get("/api/health").set("Origin", configuredOrigin);
    const unrelated = await request(createTestApp()).get("/api/health").set("Origin", "https://unrelated.example");

    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(configuredOrigin);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["access-control-allow-origin"]).not.toBe("*");
    expect(allowed.headers.vary).toContain("Origin");

    expect(unrelated.status).toBe(200);
    expect(unrelated.headers["access-control-allow-origin"]).toBeUndefined();
    expect(unrelated.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("does not reject safe HEAD or OPTIONS requests without Origin", async () => {
    const head = await request(createTestApp()).head("/api/health");
    const options = await request(createTestApp()).options("/api/health");

    expect(head.status).toBe(200);
    expect(options.status).not.toBe(403);
    expect(options.headers["access-control-allow-origin"]).toBeUndefined();
    expect(options.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("handles a valid configured-origin preflight with the frozen methods and requested Content-Type", async () => {
    const response = await request(createTestApp())
      .options(probePath)
      .set("Origin", configuredOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(configuredOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toBe("GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
    expect(response.headers["access-control-allow-headers"]).toBe("Content-Type");
    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("grants no permission to an invalid preflight and does not treat OPTIONS as unsafe", async () => {
    const response = await request(createTestApp())
      .options(probePath)
      .set("Origin", "https://unrelated.example")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).not.toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("RM-011 unsafe-Origin enforcement", () => {
  it.each(unsafeMethods)("allows %s with the exact configured Origin to reach normal routing", async (method) => {
    const response = await sendUnsafe(createTestApp(), method, configuredOrigin);

    expect(response.status).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBe(configuredOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it.each(unsafeMethods)("rejects %s without Origin through the RM-010 envelope", async (method) => {
    const response = await sendUnsafe(createTestApp(), method);

    expectForbiddenOrigin(response);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it.each(unsafeMethods)("rejects %s from an unrelated Origin without CORS permission", async (method) => {
    const suppliedOrigin = "https://unrelated.example";
    const response = await sendUnsafe(createTestApp(), method, suppliedOrigin);

    expectForbiddenOrigin(response);
    expect(response.text).not.toContain(suppliedOrigin);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it.each([
    ["different scheme", "https://localhost:3000"],
    ["different hostname", "http://127.0.0.1:3000"],
    ["subdomain", "http://app.localhost:3000"],
    ["hostname suffix", "http://localhost.example:3000"],
    ["different port", "http://localhost:3001"],
    ["trailing slash", "http://localhost:3000/"],
    ["path", "http://localhost:3000/private"],
    ["different case", "HTTP://LOCALHOST:3000"],
    ["opaque null", "null"],
    ["comma-separated values", "http://localhost:3000, https://unrelated.example"]
  ])("rejects an exact-match edge case: %s", async (_label, origin) => {
    const response = await sendUnsafe(createTestApp(), "post", origin);

    expectForbiddenOrigin(response);
    expect(response.text).not.toContain(origin);
  });
});

interface CookieCapture {
  readonly cookies: Readonly<Record<string, string>>;
  readonly rawHeader: string | undefined;
  readonly hasAuth: boolean;
  readonly hasUser: boolean;
}

function createCookieCaptureApp(captures: CookieCapture[]): express.Express {
  const app = express();

  app.use(cookieParserMiddleware);
  app.get("/capture", (incomingRequest, response) => {
    captures.push({
      cookies: incomingRequest.cookies,
      rawHeader: incomingRequest.headers.cookie,
      hasAuth: Object.hasOwn(incomingRequest, "auth"),
      hasUser: Object.hasOwn(incomingRequest, "user")
    });
    response.sendStatus(204);
  });

  return app;
}

describe("RM-011 passive cookie parsing", () => {
  it("attaches a frozen empty null-prototype map when Cookie is absent", async () => {
    const captures: CookieCapture[] = [];
    await request(createCookieCaptureApp(captures)).get("/capture").expect(204);

    const cookies = captures[0]?.cookies;
    expect(cookies).toBeDefined();
    expect(Object.keys(cookies ?? {})).toStrictEqual([]);
    expect(Object.getPrototypeOf(cookies)).toBeNull();
    expect(Object.isFrozen(cookies)).toBe(true);
  });

  it("parses strings deterministically while preserving values and the raw header", async () => {
    const captures: CookieCapture[] = [];
    const rawHeader = [
      "theme=dark",
      " malformed ",
      "=missing-name",
      "bad name=value",
      "theme=light",
      "token=a=b=c",
      "empty=",
      "encoded=a%20b",
      "rentmate_session=fake.jwt.value"
    ].join("; ");

    await request(createCookieCaptureApp(captures)).get("/capture").set("Cookie", rawHeader).expect(204);

    const capture = captures[0];
    expect(capture?.rawHeader).toBe(rawHeader);
    expect({ ...capture?.cookies }).toStrictEqual({
      theme: "dark",
      token: "a=b=c",
      empty: "",
      encoded: "a%20b",
      rentmate_session: "fake.jwt.value"
    });
    expect(capture?.hasAuth).toBe(false);
    expect(capture?.hasUser).toBe(false);
    expect(Object.isFrozen(capture?.cookies)).toBe(true);
    expect(Reflect.set(capture?.cookies ?? {}, "later", "value")).toBe(false);
  });

  it("keeps special cookie names as own data without prototype pollution", async () => {
    const captures: CookieCapture[] = [];
    await request(createCookieCaptureApp(captures))
      .get("/capture")
      .set("Cookie", "__proto__=safe; constructor=also-safe; prototype=value")
      .expect(204);

    const cookies = captures[0]?.cookies;
    expect(Object.getPrototypeOf(cookies)).toBeNull();
    expect(cookies?.__proto__).toBe("safe");
    expect(cookies?.constructor).toBe("also-safe");
    expect(cookies?.prototype).toBe("value");
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });
});

describe("RM-011 regressions", () => {
  it("preserves the exact connected and unavailable health responses", async () => {
    const connected = await request(createTestApp()).get("/api/health");
    const unavailable = await request(
      createTestApp({
        checkDatabaseConnection: async () => {
          throw new Error("controlled unavailable");
        }
      })
    ).get("/api/health");

    expect(connected.status).toBe(200);
    expect(connected.body).toStrictEqual({ status: "ok", database: "connected" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toStrictEqual({ status: "error", database: "unavailable" });
  });

  it("keeps malformed JSON behind an allowed Origin on the RM-010 sanitized envelope", async () => {
    const response = await request(createTestApp())
      .post(probePath)
      .set("Origin", configuredOrigin)
      .set("Content-Type", "application/json")
      .send('{"private":"value"');
    const requestId = (response.body as { error: { requestId: string } }).error.requestId;

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({
      error: {
        code: "MALFORMED_REQUEST",
        message: "The request body contains malformed JSON.",
        requestId
      }
    });
    expect(response.text).not.toContain("private");
  });

  it("preserves sanitized unexpected errors and request logging without cookie or Origin data", async () => {
    const logger = createLoggerMock();
    const app = express();

    app.use(requestIdMiddleware);
    app.use(requestLoggerMiddleware(logger));
    app.use(createCorsMiddleware(configuredOrigin));
    app.use(createOriginGuard(configuredOrigin));
    app.use(cookieParserMiddleware);
    app.use(express.json());
    app.get("/failure", () => {
      throw new Error("Cookie=private; Origin=https://private.example; JWT=private");
    });
    app.use(unexpectedErrorHandler(logger));

    const response = await request(app)
      .get("/failure")
      .set("Cookie", "rentmate_session=fake.jwt.value")
      .set("Origin", configuredOrigin);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
    expect(logger.info).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({ method: "GET", path: "/failure", status: 500 })
    );

    const publicAndLogged = `${response.text}${JSON.stringify(logger.info.mock.calls)}${JSON.stringify(
      logger.error.mock.calls
    )}`;
    for (const privateValue of ["fake.jwt.value", "private.example", "Cookie=private", "JWT=private"]) {
      expect(publicAndLogged).not.toContain(privateValue);
    }
  });
});
