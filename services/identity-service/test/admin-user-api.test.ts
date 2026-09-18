import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import type { RequestHandler } from "express";
import { createApp } from "../../shared/src/runtime/app.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createAdminUserRepository } from "../src/modules/users/repositories/admin-user-repository.js";
import type { AdminUserRepository } from "../src/modules/users/repositories/admin-user-repository.js";
import { registerUsersRoutes } from "../src/modules/users/routes.js";
import { createAdminUserService } from "../src/modules/users/services/admin-user-service.js";
import type { AdminUserDetail, UserProfile } from "../src/modules/users/user-profile.js";
import {
  validateAdminUserCollectionQuery,
  type AdminUserCollectionQuery
} from "../src/modules/users/validations/admin-user-validation.js";
import type { TransactionRunner } from "../src/shared/transaction.js";

const createdAt = new Date("2026-09-01T08:00:00.000Z");
const updatedAt = new Date("2026-09-02T09:00:00.000Z");

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return Object.freeze({
    id: 42,
    role: "TENANT",
    displayName: "Minh Anh",
    email: "minh.anh@example.com",
    phone: "+84901234567",
    isActive: true,
    createdAt,
    updatedAt,
    ...overrides
  });
}

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return Object.freeze({
    ...profile(),
    emailVerified: true,
    phoneVerified: false,
    ...overrides
  });
}

function serviceFixture(
  initialTarget: UserProfile | null = profile(),
  initialDetail: AdminUserDetail | null = detail()
) {
  let target = initialTarget;
  let detailTarget = initialDetail;
  let lastListQuery: AdminUserCollectionQuery | null = null;
  let updates = 0;
  let transactionTail = Promise.resolve();
  const repository: AdminUserRepository = {
    async findUserPage(input) {
      lastListQuery = {
        q: input.q,
        userId: input.userId,
        role: input.role,
        isActive: input.isActive,
        page: input.offset / Math.max(1, input.limit - 1) + 1,
        pageSize: input.limit - 1,
        offset: input.offset
      };
      return target ? [target] : [];
    },
    async findUserDetail() {
      return detailTarget;
    },
    async lockActivationTarget() {
      return target;
    },
    async updateActivation(input) {
      if (!target) throw new Error("Activation target disappeared.");
      updates += 1;
      target = profile({ ...target, role: input.lockedRole, isActive: input.isActive, updatedAt: new Date() });
      return target;
    }
  };
  const transactionRunner: TransactionRunner = async (operation) => {
    const previous = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation({} as SqlExecutor);
    } finally {
      release();
    }
  };
  const service = createAdminUserService({
    repository,
    transactionRunner,
    transactionRepositoryFactory: () => repository
  });
  return {
    service,
    updates: () => updates,
    target: () => target,
    lastListQuery: () => lastListQuery,
    setDetail: (next: AdminUserDetail | null) => {
      detailTarget = next;
    }
  };
}

test("admin user search normalization is bounded and keeps empty q equivalent to no filter", () => {
  assert.deepEqual(validateAdminUserCollectionQuery({ q: "  42  ", role: "tenant", page: "2", pageSize: "5" }), {
    q: "42",
    userId: 42,
    role: "TENANT",
    isActive: null,
    page: 2,
    pageSize: 5,
    offset: 5
  });
  assert.deepEqual(validateAdminUserCollectionQuery({ q: "  " }), {
    q: null,
    userId: null,
    role: null,
    isActive: null,
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.equal(validateAdminUserCollectionQuery({ q: " MINH@example.com " }).q, "MINH@example.com");
  assert.equal(validateAdminUserCollectionQuery({ q: "Minh Anh", isActive: "false" }).isActive, false);
  assert.throws(() => validateAdminUserCollectionQuery({ q: "x".repeat(321) }), { code: "VALIDATION_FAILED" });
  assert.throws(() => validateAdminUserCollectionQuery({ q: "Minh\nAnh" }), { code: "VALIDATION_FAILED" });
  assert.throws(() => validateAdminUserCollectionQuery({ q: "Minh\uD800Anh" }), { code: "VALIDATION_FAILED" });
  assert.throws(() => validateAdminUserCollectionQuery({ q: ["one", "two"] }), { code: "VALIDATION_FAILED" });
});

test("admin user repository applies literal case-insensitive search with filters, pagination, and fixed ordering", async () => {
  const queries: Array<{ readonly text: string; readonly values: readonly unknown[] }> = [];
  const executor = {
    async query(query: { readonly text: string; readonly values: readonly unknown[] }) {
      queries.push(query);
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            id: 42,
            role: "TENANT",
            display_name: "Minh Anh",
            email: "minh_anh@example.com",
            phone_e164: null,
            is_active: false,
            created_at: createdAt,
            updated_at: updatedAt
          }
        ]
      };
    }
  } as SqlExecutor;
  const repository = createAdminUserRepository(executor);

  const rows = await repository.findUserPage({
    q: "minh_%",
    userId: null,
    role: "TENANT",
    isActive: false,
    limit: 6,
    offset: 5
  });

  assert.equal(rows[0]?.id, 42);
  assert.deepEqual(queries[0]?.values, ["TENANT", false, "%minh\\_\\%%", null, 6, 5]);
  assert.match(queries[0]?.text ?? "", /email ILIKE \$3::text ESCAPE '\\'/);
  assert.match(queries[0]?.text ?? "", /display_name ILIKE \$3::text ESCAPE '\\'/);
  assert.match(queries[0]?.text ?? "", /created_at DESC,\s*id DESC/);

  await repository.findUserPage({ q: "42", userId: 42, role: null, isActive: null, limit: 21, offset: 0 });
  assert.deepEqual(queries[1]?.values, [null, null, "%42%", 42, 21, 0]);

  await repository.findUserPage({
    q: "minh.anh@example.com",
    userId: null,
    role: "TENANT",
    isActive: true,
    limit: 21,
    offset: 0
  });
  assert.deepEqual(queries[2]?.values, ["TENANT", true, "%minh.anh@example.com%", null, 21, 0]);

  await repository.findUserPage({ q: "Minh Anh", userId: null, role: null, isActive: null, limit: 21, offset: 20 });
  assert.deepEqual(queries[3]?.values, [null, null, "%Minh Anh%", null, 21, 20]);
});

test("admin detail repository exposes only factual verification booleans", async () => {
  const executor = {
    async query() {
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            id: 9,
            role: "ADMIN",
            display_name: "Operations",
            email: "ops@example.com",
            phone_e164: null,
            is_active: false,
            created_at: createdAt,
            updated_at: updatedAt,
            email_verified: true,
            phone_verified: false,
            password_hash: "must-not-map",
            secret_hash: "must-not-map"
          }
        ]
      };
    }
  } as SqlExecutor;

  const result = await createAdminUserRepository(executor).findUserDetail(9);
  assert.deepEqual(result, {
    id: 9,
    role: "ADMIN",
    displayName: "Operations",
    email: "ops@example.com",
    phone: null,
    isActive: false,
    createdAt,
    updatedAt,
    emailVerified: true,
    phoneVerified: false
  });
  assert.doesNotMatch(JSON.stringify(result), /password|secret|hash/i);
});

test("admin detail service reads active, inactive, and ADMIN targets and maps missing targets to 404", async () => {
  const admin = { userId: 1, role: "ADMIN" as const };
  const fixture = serviceFixture();
  assert.equal((await fixture.service.getUser(admin, 42)).isActive, true);
  fixture.setDetail(detail({ isActive: false }));
  assert.equal((await fixture.service.getUser(admin, 42)).isActive, false);
  fixture.setDetail(detail({ role: "ADMIN" }));
  assert.equal((await fixture.service.getUser(admin, 42)).role, "ADMIN");
  fixture.setDetail(null);
  await assert.rejects(fixture.service.getUser(admin, 404), { code: "RESOURCE_NOT_FOUND", status: 404 });
  await assert.rejects(fixture.service.getUser({ userId: 2, role: "TENANT" }, 42), {
    code: "FORBIDDEN",
    status: 403
  });
});

test("activation keeps tenant/landlord, ADMIN protection, no-op, and serialized concurrency semantics", async () => {
  const admin = { userId: 1, role: "ADMIN" as const };
  for (const role of ["TENANT", "LANDLORD"] as const) {
    const fixture = serviceFixture(profile({ role, isActive: true }));
    assert.equal((await fixture.service.setActivation(admin, 42, { isActive: false })).isActive, false);
    assert.equal((await fixture.service.setActivation(admin, 42, { isActive: true })).isActive, true);
  }

  const protectedAdmin = serviceFixture(profile({ role: "ADMIN" }));
  await assert.rejects(protectedAdmin.service.setActivation(admin, 42, { isActive: false }), {
    code: "FORBIDDEN"
  });

  const sameValue = serviceFixture(profile({ role: "TENANT", isActive: false }));
  assert.equal((await sameValue.service.setActivation(admin, 42, { isActive: false })).isActive, false);
  assert.equal(sameValue.updates(), 0);

  const concurrent = serviceFixture(profile({ role: "LANDLORD", isActive: true }));
  const results = await Promise.all([
    concurrent.service.setActivation(admin, 42, { isActive: false }),
    concurrent.service.setActivation(admin, 42, { isActive: false })
  ]);
  assert.deepEqual(
    results.map((result) => result.isActive),
    [false, false]
  );
  assert.equal(concurrent.updates(), 1);
  assert.equal(concurrent.target()?.isActive, false);
});

const httpFixture = serviceFixture();
const authenticationMiddleware: RequestHandler = (request, _response, next): void => {
  const actor = request.header("x-test-actor");
  if (!actor || actor === "inactive") {
    next(new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }
  (request as unknown as { auth: { readonly userId: number; readonly role: "ADMIN" | "TENANT" } }).auth = {
    userId: actor === "admin" ? 1 : 2,
    role: actor === "admin" ? "ADMIN" : "TENANT"
  };
  next();
};
const app = createApp({
  frontendOrigin: "http://localhost:3000",
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  checkDatabaseConnection: async () => {},
  registerApiRoutes(router) {
    registerUsersRoutes(router, {
      authenticationMiddleware,
      adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
      adminUserService: httpFixture.service,
      usersService: {} as never
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

async function get(path: string, actor?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1${path}`, { headers: actor ? { "x-test-actor": actor } : undefined });
}

test("admin user detail HTTP contract enforces authorization and omits credential fields", async () => {
  assert.equal((await get("/admin/users/42")).status, 401);
  assert.equal((await get("/admin/users/42", "tenant")).status, 403);
  assert.equal((await get("/admin/users/42", "inactive")).status, 401);

  const response = await get("/admin/users/42", "admin");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      id: 42,
      role: "TENANT",
      displayName: "Minh Anh",
      email: "minh.anh@example.com",
      phone: "+84901234567",
      isActive: true,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      emailVerified: true,
      phoneVerified: false
    }
  });

  httpFixture.setDetail(null);
  assert.equal((await get("/admin/users/404", "admin")).status, 404);
  httpFixture.setDetail(detail());

  assert.equal((await get("/admin/users/42?extra=1", "admin")).status, 422);
});

test("admin user list HTTP contract composes search with filters and pagination", async () => {
  const response = await get("/admin/users?q=Minh%20Anh&role=TENANT&isActive=true&page=2&pageSize=5", "admin");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).pagination.page, 2);
  assert.deepEqual(httpFixture.lastListQuery(), {
    q: "Minh Anh",
    userId: null,
    role: "TENANT",
    isActive: true,
    page: 2,
    pageSize: 5,
    offset: 5
  });

  assert.equal((await get(`/admin/users?q=${"x".repeat(321)}`, "admin")).status, 422);
  assert.equal((await get("/admin/users?q=one&q=two", "admin")).status, 422);
});
