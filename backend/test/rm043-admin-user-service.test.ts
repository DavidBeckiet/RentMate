import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type { AdminUserRepository } from "../src/modules/users/admin-user-repository.js";
import { createAdminUserService } from "../src/modules/users/admin-user-service.js";
import type { UserProfile } from "../src/modules/users/user-profile.js";

const admin = Object.freeze({ userId: 3, role: "ADMIN" as const });
const createdAt = new Date("2026-08-09T07:15:00.000Z");
const updatedAt = new Date("2026-08-10T07:15:00.000Z");

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return Object.freeze({
    id: 42,
    role: "LANDLORD",
    email: "owner@example.com",
    phone: "+84901234567",
    isActive: true,
    createdAt,
    updatedAt,
    ...overrides
  });
}

function setup(target: UserProfile | null = profile()) {
  const calls: string[] = [];
  const executor = {} as SqlExecutor;
  const repository: AdminUserRepository = {
    findUserPage: vi.fn(async () => [profile({ id: 4 }), profile({ id: 3 }), profile({ id: 2 })]),
    lockActivationTarget: vi.fn(async () => {
      calls.push("lock");
      return target;
    }),
    updateActivation: vi.fn(async (input) => {
      calls.push("update");
      return profile({ id: input.userId, role: input.lockedRole, isActive: input.isActive, updatedAt: new Date() });
    })
  };
  let runnerCalls = 0;
  const transactionRunner: TransactionRunner = async <Value>(operation: (value: SqlExecutor) => Promise<Value>) => {
    runnerCalls += 1;
    return operation(executor);
  };
  const service = createAdminUserService({
    repository,
    transactionRunner,
    transactionRepositoryFactory: (received) => {
      expect(received).toBe(executor);
      return repository;
    }
  });
  return { service, repository, calls, runnerCalls: () => runnerCalls };
}

describe("RM-043 admin user service", () => {
  it("defensively rejects non-admin callers before reads or transactions", async () => {
    const fixture = setup();
    const tenant = { userId: 7, role: "TENANT" as const };
    await expect(
      fixture.service.listUsers(tenant, { role: null, isActive: null, page: 1, pageSize: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fixture.service.setActivation(tenant, 42, { isActive: false })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(fixture.repository.findUserPage).not.toHaveBeenCalled();
    expect(fixture.runnerCalls()).toBe(0);
  });

  it("uses limit plus one and returns trimmed pagination metadata", async () => {
    const fixture = setup();
    const page = await fixture.service.listUsers(admin, {
      role: "ADMIN",
      isActive: false,
      page: 2,
      pageSize: 2,
      offset: 2
    });
    expect(fixture.repository.findUserPage).toHaveBeenCalledWith({
      role: "ADMIN",
      isActive: false,
      limit: 3,
      offset: 2
    });
    expect(page.users).toHaveLength(2);
    expect(page).toMatchObject({ page: 2, pageSize: 2, hasNextPage: true });
  });

  it("maps missing target to 404 and ADMIN target to 403 without update", async () => {
    const missing = setup(null);
    await expect(missing.service.setActivation(admin, 99, { isActive: false })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND"
    });
    expect(missing.calls).toStrictEqual(["lock"]);

    const forbidden = setup(profile({ role: "ADMIN", phone: null }));
    await expect(forbidden.service.setActivation(admin, 42, { isActive: false })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(forbidden.calls).toStrictEqual(["lock"]);
  });

  it("returns a same-state target unchanged without UPDATE", async () => {
    const target = profile({ isActive: false });
    const fixture = setup(target);
    await expect(fixture.service.setActivation(admin, 42, { isActive: false })).resolves.toBe(target);
    expect(fixture.calls).toStrictEqual(["lock"]);
    expect(fixture.repository.updateActivation).not.toHaveBeenCalled();
  });

  it("performs one meaningful update using the locked legal role", async () => {
    const fixture = setup(profile({ role: "TENANT", phone: null, isActive: true }));
    await expect(fixture.service.setActivation(admin, 42, { isActive: false })).resolves.toMatchObject({
      id: 42,
      role: "TENANT",
      isActive: false
    });
    expect(fixture.repository.updateActivation).toHaveBeenCalledWith({
      userId: 42,
      isActive: false,
      lockedRole: "TENANT"
    });
    expect(fixture.calls).toStrictEqual(["lock", "update"]);
    expect(fixture.runnerCalls()).toBe(1);
  });
});
