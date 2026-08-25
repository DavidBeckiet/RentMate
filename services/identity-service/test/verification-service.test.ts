import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  LandlordVerification,
  VerificationRepository
} from "../src/modules/verifications/repositories/verification-repository.js";
import { createVerificationService } from "../src/modules/verifications/services/verification-service.js";

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 11, role: "LANDLORD" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 20, role: "ADMIN" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "TENANT" });
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

function harness(options: { readonly contactsVerified?: boolean } = {}) {
  const rows = new Map<number, LandlordVerification>();
  let nextId = 1;
  const repository: VerificationRepository = {
    async create(_executor, landlordId, input) {
      const row: LandlordVerification = Object.freeze({
        id: nextId++,
        landlord: Object.freeze({ id: landlordId, email: "owner@example.com", phone: "+84901234567", isActive: true }),
        displayName: input.displayName,
        requestNote: input.note,
        status: "PENDING",
        decisionNote: null,
        reviewedByAdminId: null,
        submittedAt: "2026-08-23T00:00:00.000Z",
        reviewedAt: null,
        updatedAt: "2026-08-23T00:00:00.000Z"
      });
      rows.set(row.id, row);
      return row;
    },
    async findLatestForLandlord(_executor, landlordId) {
      return [...rows.values()].filter((row) => row.landlord.id === landlordId).at(-1) ?? null;
    },
    async findBlockingForLandlord(_executor, landlordId) {
      return [...rows.values()].find((row) => row.landlord.id === landlordId && row.status !== "REJECTED") ?? null;
    },
    async hasVerifiedContacts() {
      return options.contactsVerified ?? true;
    },
    async list(_executor, input) {
      return [...rows.values()]
        .filter((row) => row.status === input.status)
        .slice(input.offset, input.offset + input.limit);
    },
    async findById(_executor, verificationId) {
      return rows.get(verificationId) ?? null;
    },
    async review(_executor, verificationId, status, note, adminId) {
      const current = rows.get(verificationId)!;
      const updated: LandlordVerification = Object.freeze({
        ...current,
        status,
        decisionNote: note,
        reviewedByAdminId: adminId,
        reviewedAt: "2026-08-23T01:00:00.000Z",
        updatedAt: "2026-08-23T01:00:00.000Z"
      });
      rows.set(verificationId, updated);
      return updated;
    },
    async findVerifiedLandlordIds(_executor, landlordIds) {
      return landlordIds.filter((id) =>
        [...rows.values()].some((row) => row.landlord.id === id && row.status === "APPROVED")
      );
    }
  };
  return {
    rows,
    service: createVerificationService({ repository, transactionRunner: (operation) => operation(executor) })
  };
}

test("requires verified email and phone before accepting a manual landlord profile", async () => {
  const subject = harness({ contactsVerified: false });
  await assert.rejects(
    () => subject.service.create(landlord, { displayName: "Nguyễn Văn An", note: null }),
    /email and phone verification are required/i
  );
  assert.equal(subject.rows.size, 0);
});

test("allows a landlord to submit once while a request is active", async () => {
  const subject = harness();
  const created = await subject.service.create(landlord, { displayName: "Nguyễn Văn An", note: null });
  assert.equal(created.status, "PENDING");
  assert.equal((await subject.service.current(landlord))?.id, created.id);
  await assert.rejects(
    () => subject.service.create(landlord, { displayName: "Nguyễn Văn An", note: null }),
    /pending or approved/i
  );
  await assert.rejects(() => subject.service.create(tenant, { displayName: "Tenant", note: null }), /permission/i);
});

test("lets an admin approve exactly one pending request", async () => {
  const subject = harness();
  const created = await subject.service.create(landlord, { displayName: "Nguyễn Văn An", note: "Đối chiếu thủ công." });
  const approved = await subject.service.review(admin, created.id, { status: "APPROVED", note: "Thông tin phù hợp." });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.reviewedByAdminId, admin.userId);
  await assert.rejects(
    () => subject.service.review(admin, created.id, { status: "REJECTED", note: "late" }),
    /no longer/i
  );
});

test("keeps the admin queue role-protected and paginated", async () => {
  const subject = harness();
  await subject.service.create(landlord, { displayName: "Nguyễn Văn An", note: null });
  const page = await subject.service.list(admin, { status: "PENDING", page: 1, pageSize: 20, offset: 0 });
  assert.equal(page.data.length, 1);
  await assert.rejects(
    () => subject.service.list(landlord, { status: "PENDING", page: 1, pageSize: 20, offset: 0 }),
    /permission/i
  );
});
