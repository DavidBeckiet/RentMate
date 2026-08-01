import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import type { Logger } from "../src/shared/logging/logger.js";
import {
  authenticationRequiredMessage,
  createOptionalAuthenticationMiddleware,
  createProtectedAuthenticationMiddleware,
  type AuthenticationMiddlewareDependencies
} from "../src/shared/middleware/authentication.js";
import { cookieParserMiddleware } from "../src/shared/middleware/cookie-parser.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";
import { createRoleMiddleware, forbiddenRoleMessage } from "../src/shared/middleware/role.js";
import type {
  AuthenticatedPrincipal,
  AuthenticationAccount,
  UserRole,
  VerifiedSessionClaims
} from "../src/shared/types/authentication.js";

const sessionToken = "fake.rm012.session";
const validClaims: VerifiedSessionClaims = { userId: 42, role: "TENANT" };
const activeTenant: AuthenticationAccount = { id: 42, role: "TENANT", isActive: true };

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

function createDependencies(
  options: {
    readonly verification?: AuthenticationMiddlewareDependencies["verifySessionToken"];
    readonly accountLoader?: AuthenticationMiddlewareDependencies["loadAuthenticationAccount"];
  } = {}
) {
  return {
    verifySessionToken: options.verification ?? vi.fn(async () => ({ status: "valid", claims: validClaims }) as const),
    loadAuthenticationAccount: options.accountLoader ?? vi.fn(async () => activeTenant)
  } satisfies AuthenticationMiddlewareDependencies;
}

function createAuthenticationApp(
  mode: "protected" | "optional",
  dependencies: AuthenticationMiddlewareDependencies,
  logger: Logger = createLoggerMock()
): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(cookieParserMiddleware);
  app.use(
    mode === "protected"
      ? createProtectedAuthenticationMiddleware(dependencies)
      : createOptionalAuthenticationMiddleware(dependencies)
  );
  app.get("/probe", (incomingRequest, response) => {
    const principal = incomingRequest.auth;
    const mutationSucceeded = principal ? Reflect.set(principal, "role", "ADMIN") : false;

    response.status(200).json({
      hasAuth: Object.hasOwn(incomingRequest, "auth"),
      principal: principal ?? null,
      principalFrozen: principal ? Object.isFrozen(principal) : null,
      mutationSucceeded,
      tenantOnly: principal?.role === "TENANT",
      sessionCookie: incomingRequest.cookies.rentmate_session ?? null
    });
  });
  app.use(unexpectedErrorHandler(logger));

  return app;
}

async function getProbe(app: express.Express, cookie: string | null = `rentmate_session=${sessionToken}`) {
  const pending = request(app).get("/probe");
  return cookie === null ? pending : pending.set("Cookie", cookie);
}

function expectAuthenticationRequired(response: request.Response): void {
  const requestId = (response.body as { error: { requestId: string } }).error.requestId;

  expect(response.status).toBe(401);
  expect(requestId).toMatch(/^req_[a-f0-9]{32}$/);
  expect(response.body).toStrictEqual({
    error: {
      code: "AUTHENTICATION_REQUIRED",
      message: authenticationRequiredMessage,
      requestId
    }
  });
}

describe("RM-012 protected authentication", () => {
  it.each([
    ["missing cookie", null],
    ["empty session cookie", "rentmate_session="]
  ])("returns the same 401 for %s without invoking dependencies", async (_label, cookie) => {
    const dependencies = createDependencies();
    const response = await getProbe(createAuthenticationApp("protected", dependencies), cookie);

    expectAuthenticationRequired(response);
    expect(dependencies.verifySessionToken).not.toHaveBeenCalled();
    expect(dependencies.loadAuthenticationAccount).not.toHaveBeenCalled();
  });

  it.each(["invalid token", "expired token"])("returns the same 401 for an %s result", async () => {
    const dependencies = createDependencies({
      verification: vi.fn(async () => ({ status: "invalid" as const }))
    });
    const response = await getProbe(createAuthenticationApp("protected", dependencies));

    expectAuthenticationRequired(response);
    expect(dependencies.verifySessionToken).toHaveBeenCalledWith(sessionToken);
    expect(dependencies.loadAuthenticationAccount).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "not-an-object",
    {},
    { userId: 0, role: "TENANT" },
    { userId: 2_147_483_648, role: "TENANT" },
    { userId: 1.5, role: "TENANT" },
    { userId: 42, role: "SUPER_ADMIN" }
  ])("rejects malformed verified claims without loading an account", async (claims) => {
    const dependencies = createDependencies({
      verification: vi.fn(async () => ({ status: "valid" as const, claims }))
    });
    const response = await getProbe(createAuthenticationApp("protected", dependencies));

    expectAuthenticationRequired(response);
    expect(dependencies.loadAuthenticationAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["missing account", null],
    ["inactive account", { id: 42, role: "TENANT", isActive: false }],
    ["account ID mismatch", { id: 43, role: "TENANT", isActive: true }],
    ["account role mismatch", { id: 42, role: "LANDLORD", isActive: true }]
  ] as const)("returns the same 401 for %s", async (_label, account) => {
    const dependencies = createDependencies({
      accountLoader: vi.fn(async () => account)
    });
    const response = await getProbe(createAuthenticationApp("protected", dependencies));

    expectAuthenticationRequired(response);
    expect(dependencies.loadAuthenticationAccount).toHaveBeenCalledWith(42);
    expect(response.text).not.toMatch(/inactive|mismatch|missing account|TENANT|LANDLORD/);
  });

  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)(
    "attaches an immutable minimal principal from an active %s account",
    async (role) => {
      const claims = { userId: 42, role } satisfies VerifiedSessionClaims;
      const account = { id: 42, role, isActive: true } satisfies AuthenticationAccount;
      const dependencies = createDependencies({
        verification: vi.fn(async () => ({ status: "valid" as const, claims })),
        accountLoader: vi.fn(async () => account)
      });
      const response = await getProbe(createAuthenticationApp("protected", dependencies));

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        hasAuth: true,
        principal: { userId: 42, role },
        principalFrozen: true,
        mutationSucceeded: false,
        tenantOnly: role === "TENANT",
        sessionCookie: sessionToken
      });
      expect(dependencies.verifySessionToken).toHaveBeenCalledOnce();
      expect(dependencies.verifySessionToken).toHaveBeenCalledWith(sessionToken);
      expect(dependencies.loadAuthenticationAccount).toHaveBeenCalledOnce();
      expect(dependencies.loadAuthenticationAccount).toHaveBeenCalledWith(42);
    }
  );

  it.each(["verifier", "loader"] as const)(
    "preserves a %s infrastructure failure instead of converting it to 401",
    async (failureSource) => {
      const logger = createLoggerMock();
      const privateFailure = new Error(`private-${failureSource}-details`);
      const dependencies = createDependencies({
        verification:
          failureSource === "verifier"
            ? vi.fn(async () => Promise.reject(privateFailure))
            : vi.fn(async () => ({ status: "valid" as const, claims: validClaims })),
        accountLoader:
          failureSource === "loader"
            ? vi.fn(async () => Promise.reject(privateFailure))
            : vi.fn(async () => activeTenant)
      });
      const response = await getProbe(createAuthenticationApp("protected", dependencies, logger));

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
      expect(response.text).not.toContain(privateFailure.message);
      expect(response.status).not.toBe(401);
    }
  );

  it("preserves a known infrastructure ApplicationError from a future adapter", async () => {
    const dependencies = createDependencies({
      accountLoader: vi.fn(async () => {
        throw new ApplicationError("DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable.");
      })
    });
    const response = await getProbe(createAuthenticationApp("protected", dependencies));

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});

describe("RM-012 optional authentication", () => {
  it.each([
    ["missing cookie", null],
    ["empty cookie", "rentmate_session="]
  ])("continues anonymously for %s", async (_label, cookie) => {
    const dependencies = createDependencies();
    const response = await getProbe(createAuthenticationApp("optional", dependencies), cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ hasAuth: false, principal: null, tenantOnly: false });
    expect(dependencies.verifySessionToken).not.toHaveBeenCalled();
    expect(dependencies.loadAuthenticationAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid token", { status: "invalid" }],
    ["expired token", { status: "invalid" }],
    ["malformed claims", { status: "valid", claims: { userId: 0, role: "TENANT" } }]
  ] as const)("continues anonymously for %s", async (_label, verification) => {
    const dependencies = createDependencies({
      verification: vi.fn(async () => verification)
    });
    const response = await getProbe(createAuthenticationApp("optional", dependencies));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ hasAuth: false, principal: null, tenantOnly: false });
    expect(dependencies.loadAuthenticationAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["missing account", null],
    ["inactive account", { id: 42, role: "TENANT", isActive: false }],
    ["ID mismatch", { id: 41, role: "TENANT", isActive: true }],
    ["role mismatch", { id: 42, role: "ADMIN", isActive: true }]
  ] as const)("continues anonymously for %s without tenant-only data", async (_label, account) => {
    const dependencies = createDependencies({ accountLoader: vi.fn(async () => account) });
    const response = await getProbe(createAuthenticationApp("optional", dependencies));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ hasAuth: false, principal: null, tenantOnly: false });
    expect(response.body.sessionCookie).toBe(sessionToken);
  });

  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)(
    "attaches an active %s principal while granting tenant-only data only to TENANT",
    async (role) => {
      const dependencies = createDependencies({
        verification: vi.fn(async () => ({
          status: "valid" as const,
          claims: { userId: 42, role }
        })),
        accountLoader: vi.fn(async () => ({ id: 42, role, isActive: true }))
      });
      const response = await getProbe(createAuthenticationApp("optional", dependencies));

      expect(response.status).toBe(200);
      expect(response.body.principal).toStrictEqual({ userId: 42, role });
      expect(response.body.principalFrozen).toBe(true);
      expect(response.body.tenantOnly).toBe(role === "TENANT");
    }
  );

  it.each(["verifier", "loader"] as const)(
    "does not hide a %s infrastructure failure as an anonymous request",
    async (failureSource) => {
      const privateFailure = new Error(`private-${failureSource}-failure`);
      const dependencies = createDependencies({
        verification:
          failureSource === "verifier"
            ? vi.fn(async () => Promise.reject(privateFailure))
            : vi.fn(async () => ({ status: "valid" as const, claims: validClaims })),
        accountLoader:
          failureSource === "loader"
            ? vi.fn(async () => Promise.reject(privateFailure))
            : vi.fn(async () => activeTenant)
      });
      const response = await getProbe(createAuthenticationApp("optional", dependencies));

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.text).not.toContain(privateFailure.message);
    }
  );
});

function attachPrincipal(principal: AuthenticatedPrincipal | undefined): express.RequestHandler {
  return (incomingRequest, _response, next): void => {
    if (principal) {
      Object.defineProperty(incomingRequest, "auth", {
        value: Object.freeze({ ...principal }),
        writable: false
      });
    }
    next();
  };
}

function createRoleApp(
  principal: AuthenticatedPrincipal | undefined,
  roles: readonly [UserRole, ...UserRole[]],
  resourceLookup: () => void
): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(attachPrincipal(principal));
  app.use(createRoleMiddleware(roles));
  app.get("/resource", (_incomingRequest, response) => {
    resourceLookup();
    response.status(200).json({ data: "private-resource" });
  });
  app.use(unexpectedErrorHandler(createLoggerMock()));

  return app;
}

describe("RM-012 role enforcement", () => {
  it("returns the protected 401 when no principal is present", async () => {
    const resourceLookup = vi.fn();
    const response = await request(createRoleApp(undefined, ["TENANT"], resourceLookup)).get("/resource");

    expectAuthenticationRequired(response);
    expect(resourceLookup).not.toHaveBeenCalled();
  });

  it("allows a correct single role and performs the downstream lookup", async () => {
    const resourceLookup = vi.fn();
    const response = await request(createRoleApp({ userId: 42, role: "TENANT" }, ["TENANT"], resourceLookup)).get(
      "/resource"
    );

    expect(response.status).toBe(200);
    expect(resourceLookup).toHaveBeenCalledOnce();
  });

  it("returns sanitized 403 before resource lookup for a wrong role", async () => {
    const resourceLookup = vi.fn();
    const response = await request(createRoleApp({ userId: 42, role: "LANDLORD" }, ["TENANT"], resourceLookup)).get(
      "/resource"
    );
    const requestId = (response.body as { error: { requestId: string } }).error.requestId;

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      error: {
        code: "FORBIDDEN",
        message: forbiddenRoleMessage,
        requestId
      }
    });
    expect(response.text).not.toMatch(/TENANT|LANDLORD/);
    expect(resourceLookup).not.toHaveBeenCalled();
  });

  it.each([
    ["ADMIN", 200],
    ["LANDLORD", 403]
  ] as const)("handles %s against a multiple-role allowlist", async (role, expectedStatus) => {
    const resourceLookup = vi.fn();
    const response = await request(createRoleApp({ userId: 42, role }, ["TENANT", "ADMIN"], resourceLookup)).get(
      "/resource"
    );

    expect(response.status).toBe(expectedStatus);
    expect(resourceLookup).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
  });

  it("validates static role configuration immediately", () => {
    expect(() => createRoleMiddleware([] as unknown as [UserRole, ...UserRole[]])).toThrowError(
      "Role middleware requires at least one valid role."
    );
    expect(() => createRoleMiddleware(["SUPER_ADMIN"] as unknown as [UserRole, ...UserRole[]])).toThrowError(
      "Role middleware requires at least one valid role."
    );
  });

  it("defensively copies the caller allowlist", async () => {
    const roles: UserRole[] = ["TENANT"];
    const middleware = createRoleMiddleware(roles as [UserRole, ...UserRole[]]);
    roles[0] = "ADMIN";
    const app = express();

    app.use(requestIdMiddleware);
    app.use(attachPrincipal({ userId: 42, role: "TENANT" }));
    app.use(middleware);
    app.get("/resource", (_incomingRequest, response) => response.sendStatus(204));
    app.use(unexpectedErrorHandler(createLoggerMock()));

    await request(app).get("/resource").expect(204);
  });
});
