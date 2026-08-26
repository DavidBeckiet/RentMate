import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import { createSupportService, type SupportService } from "../src/modules/support/services/support-service.js";
import type { SupportRepository, SupportRequest } from "../src/modules/support/repositories/support-repository.js";
import type { IdentityAccountClient, IdentityUserProfile } from "../../shared/identity-account-client.js";
import type {
  CreateSupportRequestInput,
  SupportRequestCollectionQuery
} from "../src/modules/support/validations/support-validation.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 11, role: "TENANT" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 22, role: "LANDLORD" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 99, role: "ADMIN" });
const createdAt = "2026-08-26T00:00:00.000Z";
const query: SupportRequestCollectionQuery = Object.freeze({ status: "OPEN", page: 1, pageSize: 20, offset: 0 });

function createSupportHarness(): { readonly service: SupportService; readonly requests: Map<number, SupportRequest> } {
  const requests = new Map<number, SupportRequest>();
  let nextId = 1;
  const executor: SqlExecutor = {
    query: async () => {
      throw new Error("The support service test repository does not execute SQL.");
    }
  };

  const repository: SupportRepository = {
    async create(_executor, requesterId, requesterRole, input) {
      const request: SupportRequest = Object.freeze({
        id: nextId++,
        requesterId,
        requesterRole,
        category: input.category,
        subject: input.subject,
        message: input.message,
        status: "OPEN",
        resolutionNote: null,
        assignedAdminId: null,
        createdAt,
        updatedAt: createdAt,
        resolvedAt: null
      });
      requests.set(request.id, request);
      return request;
    },
    async list(_executor, input) {
      return [...requests.values()]
        .filter((request) => request.status === input.status)
        .slice(0, input.limit)
        .map((request) => Object.freeze({ ...request }));
    },
    async findById(_executor, supportRequestId) {
      return requests.get(supportRequestId) ?? null;
    },
    async updateStatus(_executor, supportRequestId, status, adminId, note) {
      const current = requests.get(supportRequestId);
      if (!current) throw new Error("Support request was not initialized.");
      const updated: SupportRequest = Object.freeze({
        ...current,
        status,
        assignedAdminId: adminId,
        resolutionNote: status === "RESOLVED" ? note : null,
        resolvedAt: status === "RESOLVED" ? createdAt : null,
        updatedAt: createdAt
      });
      requests.set(supportRequestId, updated);
      return updated;
    }
  };

  const profiles: readonly IdentityUserProfile[] = Object.freeze([
    Object.freeze({ id: tenant.userId, role: "TENANT", email: "tenant@example.test", phone: "+84900000000", isActive: true }),
    Object.freeze({ id: landlord.userId, role: "LANDLORD", email: "landlord@example.test", phone: null, isActive: true })
  ]);
  const identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds"> = {
    loadProfilesByIds: async (ids) => Object.freeze(profiles.filter((profile) => ids.includes(profile.id)))
  };

  return {
    requests,
    service: createSupportService({
      repository,
      identityAccountClient,
      transactionRunner: { run: (operation) => operation(executor) }
    })
  };
}

const supportInput: CreateSupportRequestInput = Object.freeze({
  category: "TECHNICAL",
  subject: "Không mở được cuộc trò chuyện",
  message: "Trang bị lỗi khi tôi muốn gửi tin nhắn."
});

test("accepts authenticated tenant and landlord requests and enriches the admin queue safely", async () => {
  const harness = createSupportHarness();
  const createdTenant = await harness.service.create(tenant, supportInput);
  const createdLandlord = await harness.service.create(landlord, { ...supportInput, category: "LISTING" });

  assert.equal(createdTenant.requesterRole, "TENANT");
  assert.equal(createdLandlord.requesterRole, "LANDLORD");
  const page = await harness.service.listAdmin(admin, query);
  assert.equal(page.data.length, 2);
  assert.equal(page.data[0]?.requester.email, "tenant@example.test");
  assert.equal("phone" in (page.data[0]?.requester ?? {}), false);
});

test("restricts admin actions and applies support request status transitions", async () => {
  const harness = createSupportHarness();
  const created = await harness.service.create(tenant, supportInput);

  await assert.rejects(
    () => harness.service.listAdmin(tenant, query),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  const inProgress = await harness.service.updateAdmin(admin, created.id, { status: "IN_PROGRESS", note: null });
  assert.equal(inProgress.status, "IN_PROGRESS");
  const resolved = await harness.service.updateAdmin(admin, created.id, {
    status: "RESOLVED",
    note: "Đã hướng dẫn người dùng."
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.resolutionNote, "Đã hướng dẫn người dùng.");
  await assert.rejects(
    () => harness.service.updateAdmin(admin, created.id, { status: "IN_PROGRESS", note: null }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});
