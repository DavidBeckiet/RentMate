import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { registerUsersRoutes } from "../src/modules/users/routes.js";
import type { UserProfile } from "../src/modules/users/user-profile.js";
import type { UsersService } from "../src/modules/users/users-service.js";
import { createProtectedAuthenticationMiddleware } from "../src/shared/middleware/authentication.js";
import type { AuthenticationAccount, SessionVerificationResult, UserRole } from "../src/shared/types/authentication.js";
import type { Logger } from "../src/shared/logging/logger.js";

const origin = "http://localhost:3000";
const token = "rm017-http-token";

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function makeProfile(role: UserRole, phone: string | null = "+84901234567"): UserProfile {
  return Object.freeze({
    id: 17,
    role,
    email: `${role.toLowerCase()}@example.com`,
    phone,
    isActive: true,
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-02T00:00:00.000Z")
  });
}

interface HarnessOptions {
  readonly role?: UserRole;
  readonly profile?: UserProfile;
  readonly verification?: SessionVerificationResult;
  readonly account?: AuthenticationAccount | null;
  readonly usersService?: UsersService;
}

function makeHarness(options: HarnessOptions = {}) {
  const role = options.role ?? "TENANT";
  const profile = options.profile ?? makeProfile(role);
  const verify = vi.fn(
    async () => options.verification ?? ({ status: "valid", claims: { userId: profile.id, role } } as const)
  );
  const load = vi.fn(async () => options.account ?? { id: profile.id, role, isActive: true });
  const usersService =
    options.usersService ??
    ({
      getCurrentUser: vi.fn().mockResolvedValue(profile),
      updateCurrentUserPhone: vi.fn().mockResolvedValue(profile)
    } satisfies UsersService);

  const app = createApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) => {
      registerUsersRoutes(router, {
        authenticationMiddleware: createProtectedAuthenticationMiddleware({
          verifySessionToken: verify,
          loadAuthenticationAccount: load
        }),
        usersService
      });
    }
  });

  return { app, verify, load, usersService, profile };
}

function withSession(app: ReturnType<typeof createApp>, method: "get" | "patch", path: string) {
  return request(app)[method](path).set("Cookie", `rentmate_session=${token}`);
}

describe("RM-017 current-user HTTP contract", () => {
  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("returns the exact active %s profile", async (role) => {
    const harness = makeHarness({ role });
    const response = await withSession(harness.app, "get", "/api/v1/users/me").expect(200);

    expect(response.body).toStrictEqual({
      data: {
        id: 17,
        role,
        email: `${role.toLowerCase()}@example.com`,
        phone: "+84901234567",
        isActive: true,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-02T00:00:00.000Z"
      }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash|rentmate_session|snake_case/i);
    expect(harness.usersService.getCurrentUser).toHaveBeenCalledWith({ userId: 17, role });
  });

  it("rejects every query key only after authentication", async () => {
    const harness = makeHarness();
    const response = await withSession(harness.app, "get", "/api/v1/users/me?userId=17").expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(harness.usersService.getCurrentUser).not.toHaveBeenCalled();

    const missing = makeHarness();
    await request(missing.app).get("/api/v1/users/me?userId=17").expect(401);
    expect(missing.verify).not.toHaveBeenCalled();
  });

  it.each([
    ["tenant valid", "TENANT", { phone: "+84981112223" }, "+84981112223"],
    ["tenant null", "TENANT", { phone: null }, null],
    ["admin valid", "ADMIN", { phone: "+84981112223" }, "+84981112223"],
    ["admin null", "ADMIN", { phone: null }, null],
    ["landlord replacement", "LANDLORD", { phone: "+84981112223" }, "+84981112223"]
  ] as const)("accepts %s", async (_label, role, body, phone) => {
    const profile = makeProfile(role, phone);
    const updateCurrentUserPhone = vi.fn().mockResolvedValue(profile);
    const harness = makeHarness({ role, profile, usersService: { getCurrentUser: vi.fn(), updateCurrentUserPhone } });

    const response = await withSession(harness.app, "patch", "/api/v1/users/me")
      .set("Origin", origin)
      .send(body)
      .expect(200);

    expect(response.body.data.phone).toBe(phone);
    expect(updateCurrentUserPhone).toHaveBeenCalledWith({ userId: 17, role }, { phoneProvided: true, phone });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("accepts landlord omitted phone as a no-op", async () => {
    const harness = makeHarness({ role: "LANDLORD" });
    await withSession(harness.app, "patch", "/api/v1/users/me").set("Origin", origin).send({}).expect(200);

    expect(harness.usersService.updateCurrentUserPhone).toHaveBeenCalledWith(
      { userId: 17, role: "LANDLORD" },
      { phoneProvided: false, phone: null }
    );
  });

  it.each([null, "", "   "] as const)("rejects landlord phone %j before service", async (phone) => {
    const update = vi.fn();
    const harness = makeHarness({
      role: "LANDLORD",
      usersService: { getCurrentUser: vi.fn(), updateCurrentUserPhone: update }
    });

    const response = await withSession(harness.app, "patch", "/api/v1/users/me")
      .set("Origin", origin)
      .send({ phone })
      .expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts an empty tenant PATCH as an idempotent no-op", async () => {
    const harness = makeHarness();
    const response = await withSession(harness.app, "patch", "/api/v1/users/me")
      .set("Origin", origin)
      .send({})
      .expect(200);

    expect(response.body.data.updatedAt).toBe("2030-01-02T00:00:00.000Z");
    expect(harness.usersService.updateCurrentUserPhone).toHaveBeenCalledWith(
      { userId: 17, role: "TENANT" },
      { phoneProvided: false, phone: null }
    );
  });

  it.each([
    "email",
    "role",
    "isActive",
    "id",
    "createdAt",
    "updatedAt",
    "password",
    "passwordHash",
    "phoneE164",
    "userId"
  ] as const)("rejects protected field %s", async (field) => {
    const update = vi.fn();
    const harness = makeHarness({ usersService: { getCurrentUser: vi.fn(), updateCurrentUserPhone: update } });

    await withSession(harness.app, "patch", "/api/v1/users/me")
      .set("Origin", origin)
      .send({ [field]: "attempt" })
      .expect(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid Origin before token verification", async () => {
    const harness = makeHarness();

    await request(harness.app)
      .patch("/api/v1/users/me")
      .set("Origin", "http://untrusted.example")
      .set("Cookie", `rentmate_session=${token}`)
      .send({ phone: "+84981112223" })
      .expect(403);
    expect(harness.verify).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it("rejects missing authentication before body validation", async () => {
    const harness = makeHarness();

    await request(harness.app)
      .patch("/api/v1/users/me")
      .set("Origin", origin)
      .send({ email: "forbidden@example.com" })
      .expect(401);
    expect(harness.verify).not.toHaveBeenCalled();
    expect(harness.usersService.updateCurrentUserPhone).not.toHaveBeenCalled();
  });

  it("returns 401 for inactive authentication", async () => {
    const harness = makeHarness({ account: { id: 17, role: "TENANT", isActive: false } });

    await withSession(harness.app, "patch", "/api/v1/users/me").set("Origin", origin).send({ phone: null }).expect(401);
    expect(harness.usersService.updateCurrentUserPhone).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before authentication", async () => {
    const harness = makeHarness();
    const response = await request(harness.app)
      .patch("/api/v1/users/me")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .set("Cookie", `rentmate_session=${token}`)
      .send("{bad-json")
      .expect(400);

    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expect(harness.verify).not.toHaveBeenCalled();
  });

  it.each(["null", "[]", '"body"', "123", "true"] as const)(
    "returns 422 for a valid primitive JSON body %s after authentication",
    async (encodedBody) => {
      const harness = makeHarness();
      const response = await request(harness.app)
        .patch("/api/v1/users/me")
        .set("Origin", origin)
        .set("Content-Type", "application/json")
        .set("Cookie", `rentmate_session=${token}`)
        .send(encodedBody)
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(harness.verify).toHaveBeenCalledOnce();
      expect(harness.usersService.updateCurrentUserPhone).not.toHaveBeenCalled();
    }
  );
});
