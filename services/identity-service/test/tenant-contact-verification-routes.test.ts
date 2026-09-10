import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import type { RequestHandler } from "express";
import { createApp } from "../../shared/src/runtime/app.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { registerVerificationRoutes } from "../src/modules/verifications/routes.js";
import type { ContactVerificationStatusResult } from "../src/modules/verifications/services/contact-verification-service.js";

const status: ContactVerificationStatusResult = Object.freeze({
  email: Object.freeze({ address: "tenant@example.com", verifiedAt: null, available: true }),
  phone: Object.freeze({ number: "+84901234567", verifiedAt: null, available: false }),
  profile: null
});

const calls: string[] = [];
const rateLimitCalls: Array<{ readonly key: string; readonly limit: number; readonly windowMs: number }> = [];
const contactVerificationService = Object.freeze({
  async status() {
    return status;
  },
  async requestEmail() {
    return status;
  },
  async confirmEmail() {
    return status;
  },
  async requestPhone() {
    return status;
  },
  async confirmPhone() {
    return status;
  },
  async tenantStatus() {
    calls.push("status");
    return status;
  },
  async requestTenantEmail() {
    calls.push("email-request");
    return status;
  },
  async confirmTenantEmail() {
    calls.push("email-confirm");
    return status;
  },
  async requestTenantPhone() {
    calls.push("phone-request");
    return status;
  },
  async confirmTenantPhone() {
    calls.push("phone-confirm");
    return status;
  }
});

const authenticationMiddleware: RequestHandler = (request, _response, next): void => {
  const actor = request.header("x-test-actor");
  if (!actor || actor === "inactive") {
    next(new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }
  (request as unknown as { auth: { readonly userId: number; readonly role: "LANDLORD" | "TENANT" } }).auth = {
    userId: 7,
    role: actor === "landlord" ? "LANDLORD" : "TENANT"
  };
  next();
};

const app = createApp({
  frontendOrigin: "http://localhost:3000",
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  checkDatabaseConnection: async () => {},
  registerApiRoutes(router) {
    registerVerificationRoutes(router, {
      authenticationMiddleware,
      tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
      landlordRoleMiddleware: createRoleMiddleware(["LANDLORD"]),
      adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
      service: {} as never,
      contactVerificationService,
      contactVerificationRateLimitStore: {
        consume: async (input) => {
          rateLimitCalls.push(input);
          return { allowed: rateLimitCalls.length <= 5 };
        }
      }
    });
  }
});

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

async function request(path: string, method = "GET", body?: unknown, actor = "tenant"): Promise<Response> {
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-test-actor": actor
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test("tenant contact verification exposes exactly the owner-private factual DTO", async () => {
  const response = await request("/tenant/verifications/status");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      email: { address: "tenant@example.com", verified: false, verifiedAt: null, available: true },
      phone: { number: "+84901234567", verified: false, verifiedAt: null, available: false }
    }
  });
  assert.deepEqual(calls, ["status"]);
});

test("tenant verification routes accept only the frozen request shapes and keep role boundaries", async () => {
  assert.equal((await request("/tenant/verifications/email/request", "POST", {})).status, 200);
  assert.equal((await request("/tenant/verifications/email/confirm", "POST", { code: "123456" })).status, 200);
  assert.equal((await request("/tenant/verifications/phone/request", "POST", {})).status, 200);
  assert.equal((await request("/tenant/verifications/phone/confirm", "POST", { code: "123456" })).status, 200);
  assert.deepEqual(calls.slice(1), ["email-request", "email-confirm", "phone-request", "phone-confirm"]);

  assert.equal((await request("/tenant/verifications/email/request", "POST", { tenantId: 8 })).status, 422);
  assert.equal((await request("/tenant/verifications/status?tenantId=8")).status, 422);
  assert.equal((await request("/tenant/verifications/status", "GET", undefined, "landlord")).status, 403);
  assert.equal((await request("/tenant/verifications/status", "GET", undefined, "inactive")).status, 401);

  assert.equal((await request("/tenant/verifications/email/request", "POST", {})).status, 429);
  assert.equal(new Set(rateLimitCalls.map((value) => value.key)).size, 1);
  assert.equal(
    rateLimitCalls.every((value) => value.limit === 5 && value.windowMs === 15 * 60 * 1_000),
    true
  );
});
