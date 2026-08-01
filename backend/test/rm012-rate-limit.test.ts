import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/shared/logging/logger.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  rateLimitedMessage,
  type Clock,
  type RateLimitConsumeInput,
  type RateLimitKeyResolver,
  type RateLimitPolicy,
  type RateLimitStore
} from "../src/shared/middleware/rate-limit.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";

const defaultPolicy: RateLimitPolicy = {
  scope: "rm012-test",
  limit: 2,
  windowMs: 1_000
};

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

function createRateLimitedApp(
  options: {
    readonly policy?: RateLimitPolicy;
    readonly resolveKey?: RateLimitKeyResolver;
    readonly store?: RateLimitStore;
    readonly clock?: Clock;
    readonly reachedRoute?: () => void;
  } = {}
): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(
    createRateLimitMiddleware({
      policy: options.policy ?? defaultPolicy,
      resolveKey: options.resolveKey ?? (() => "default-key"),
      store: options.store,
      clock: options.clock
    })
  );
  app.get("/limited", (_incomingRequest, response) => {
    options.reachedRoute?.();
    response.status(200).json({ data: "allowed" });
  });
  app.use(unexpectedErrorHandler(createLoggerMock()));

  return app;
}

describe("RM-012 rate-limit policy validation", () => {
  it("accepts a valid immutable policy", async () => {
    await request(createRateLimitedApp()).get("/limited").expect(200);
  });

  it("rejects a blank scope at factory creation", () => {
    expect(() => createRateLimitedApp({ policy: { ...defaultPolicy, scope: "   " } })).toThrowError(
      "Rate-limit scope must not be blank."
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid limit %s at factory creation", (limit) => {
    expect(() => createRateLimitedApp({ policy: { ...defaultPolicy, limit } })).toThrowError(
      "Rate-limit limit must be a positive safe integer."
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid window %s at factory creation", (windowMs) => {
    expect(() => createRateLimitedApp({ policy: { ...defaultPolicy, windowMs } })).toThrowError(
      "Rate-limit windowMs must be a positive safe integer."
    );
  });
});

describe("RM-012 fixed-window rate limiting", () => {
  it("allows the first limit requests and rejects limit plus one with the RM-010 envelope", async () => {
    const privateKey = "private-bucket-key";
    const app = createRateLimitedApp({ resolveKey: () => privateKey });

    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);
    const rejected = await request(app).get("/limited");
    const requestId = (rejected.body as { error: { requestId: string } }).error.requestId;

    expect(rejected.status).toBe(429);
    expect(requestId).toMatch(/^req_[a-f0-9]{32}$/);
    expect(rejected.body).toStrictEqual({
      error: {
        code: "RATE_LIMITED",
        message: rateLimitedMessage,
        requestId
      }
    });
    expect(rejected.text).not.toContain(privateKey);
    expect(rejected.text).not.toContain(defaultPolicy.scope);
    expect(rejected.headers["retry-after"]).toBeUndefined();
    expect(rejected.headers["x-ratelimit-limit"]).toBeUndefined();
    expect(rejected.headers["x-ratelimit-remaining"]).toBeUndefined();
  });

  it("keeps resolved keys independent", async () => {
    const app = createRateLimitedApp({
      policy: { ...defaultPolicy, limit: 1 },
      resolveKey: (incomingRequest) => incomingRequest.get("X-Test-Key") ?? "missing"
    });

    await request(app).get("/limited").set("X-Test-Key", "first").expect(200);
    await request(app).get("/limited").set("X-Test-Key", "first").expect(429);
    await request(app).get("/limited").set("X-Test-Key", "second").expect(200);
  });

  it("keeps the same resolved key independent across policy scopes", async () => {
    const store = new InMemoryRateLimitStore();
    const firstScope = createRateLimitedApp({
      policy: { scope: "first-scope", limit: 1, windowMs: 1_000 },
      store
    });
    const secondScope = createRateLimitedApp({
      policy: { scope: "second-scope", limit: 1, windowMs: 1_000 },
      store
    });

    await request(firstScope).get("/limited").expect(200);
    await request(secondScope).get("/limited").expect(200);
    await request(firstScope).get("/limited").expect(429);
    await request(secondScope).get("/limited").expect(429);
  });

  it("starts a new window at the exact reset boundary using an injected clock", async () => {
    let now = 100;
    const app = createRateLimitedApp({
      policy: { ...defaultPolicy, limit: 1 },
      clock: () => now
    });

    await request(app).get("/limited").expect(200);
    now = 1_099;
    await request(app).get("/limited").expect(429);
    now = 1_100;
    await request(app).get("/limited").expect(200);
  });

  it("removes expired entries opportunistically without timers", async () => {
    let now = 0;
    const store = new InMemoryRateLimitStore();
    const app = createRateLimitedApp({
      policy: { ...defaultPolicy, limit: 1 },
      resolveKey: (incomingRequest) => incomingRequest.get("X-Test-Key") ?? "missing",
      store,
      clock: () => now
    });

    await request(app).get("/limited").set("X-Test-Key", "expired-key").expect(200);
    expect(store.entryCount).toBe(1);
    now = 1_000;
    await request(app).get("/limited").set("X-Test-Key", "current-key").expect(200);
    expect(store.entryCount).toBe(1);
  });

  it("returns immutable store decisions", () => {
    const store = new InMemoryRateLimitStore();
    const result = store.consume({ key: "key", limit: 1, windowMs: 1_000, now: 0 });

    expect(result).toStrictEqual({ allowed: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("passes one atomic consume operation a scoped key", async () => {
    const consume = vi.fn((input: RateLimitConsumeInput) => {
      void input;
      return { allowed: true };
    });
    const store: RateLimitStore = { consume };
    const app = createRateLimitedApp({
      policy: { scope: "provider", limit: 3, windowMs: 5_000 },
      resolveKey: async () => "private-user-key",
      store,
      clock: () => 123
    });

    await request(app).get("/limited").expect(200);

    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith({
      key: JSON.stringify(["provider", "private-user-key"]),
      limit: 3,
      windowMs: 5_000,
      now: 123
    });
  });
});

describe("RM-012 rate-limit failure handling", () => {
  it.each(["throw", "reject", "blank"] as const)(
    "fails closed with a sanitized infrastructure error when the resolver returns %s",
    async (failureMode) => {
      const reachedRoute = vi.fn();
      const privateFailure = new Error("private-resolver-key-details");
      const resolveKey: RateLimitKeyResolver =
        failureMode === "throw"
          ? () => {
              throw privateFailure;
            }
          : failureMode === "reject"
            ? async () => Promise.reject(privateFailure)
            : () => "   ";
      const response = await request(createRateLimitedApp({ resolveKey, reachedRoute })).get("/limited");

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.text).not.toContain(privateFailure.message);
      expect(response.status).not.toBe(429);
      expect(reachedRoute).not.toHaveBeenCalled();
    }
  );

  it.each(["throw", "reject"] as const)(
    "fails closed with a sanitized infrastructure error when the store returns %s",
    async (failureMode) => {
      const reachedRoute = vi.fn();
      const privateFailure = new Error("private-store-details");
      const store: RateLimitStore = {
        consume:
          failureMode === "throw"
            ? () => {
                throw privateFailure;
              }
            : async () => Promise.reject(privateFailure)
      };
      const response = await request(createRateLimitedApp({ store, reachedRoute })).get("/limited");

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.text).not.toContain(privateFailure.message);
      expect(response.status).not.toBe(429);
      expect(reachedRoute).not.toHaveBeenCalled();
    }
  );

  it("does not inspect a spoofed forwarding header when a route deliberately uses request.ip", async () => {
    const consume = vi.fn((input: RateLimitConsumeInput) => {
      void input;
      return { allowed: true };
    });
    const app = createRateLimitedApp({
      resolveKey: (incomingRequest) => incomingRequest.ip ?? "missing-ip",
      store: { consume }
    });

    await request(app).get("/limited").set("X-Forwarded-For", "203.0.113.99").expect(200);

    const input = consume.mock.calls[0]?.[0];
    expect(input?.key).not.toContain("203.0.113.99");
  });
});
