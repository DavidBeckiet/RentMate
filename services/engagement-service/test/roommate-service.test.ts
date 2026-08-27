import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type {
  RoommateProfileRecord,
  RoommateRepository,
  RoommateRequestRecord
} from "../src/modules/roommate/repositories/roommate-repository.js";
import { createRoommateService } from "../src/modules/roommate/services/roommate-service.js";
import type { IdentityRoommateTenantProjection } from "../../shared/identity-account-client.js";
import type { PublicListingSummary } from "../../shared/public-listing-summary.js";

const executor = {} as SqlExecutor;
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 10, role: "TENANT" });
const otherTenant: AuthenticatedPrincipal = Object.freeze({ userId: 20, role: "TENANT" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });
const now = new Date("2026-08-27T12:00:00.000Z");

function profile(tenantId: number): RoommateProfileRecord {
  return Object.freeze({
    tenantId,
    intro: "A complete roommate profile with enough detail.",
    sleepSchedule: "STANDARD",
    cleanlinessLevel: "BALANCED",
    noisePreference: "QUIET",
    smokingEnvironment: "SMOKE_FREE",
    petEnvironment: "NO_PETS",
    moderationState: "VISIBLE",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  });
}

function request(
  id: number,
  ownerTenantId: number,
  overrides: Partial<RoommateRequestRecord> = {}
): RoommateRequestRecord {
  return Object.freeze({
    id,
    ownerTenantId,
    listingId: null,
    preferredAreaKeys: ["Quan 1"],
    budgetMinPerPerson: 1_000_000,
    budgetMaxPerPerson: 3_000_000,
    moveInFrom: "2026-09-01",
    moveInUntil: "2026-09-30",
    note: null,
    status: "OPEN",
    expiresAt: "2026-09-26T12:00:00.000Z",
    listingLinkedAt: null,
    moderationState: "VISIBLE",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides
  });
}

function listing(id: number): PublicListingSummary {
  return {
    id,
    businessStatus: "AVAILABLE",
    title: "Room",
    monthlyRent: 3_000_000,
    roomAreaSqm: 20,
    maxOccupants: 2,
    areaName: "Quan 1",
    latitude: 10.77,
    longitude: 106.7,
    propertyType: { code: "ROOM", label: "Room" },
    amenities: [],
    coverImage: { url: "https://example.test/room.jpg", altText: null, displayOrder: 1 },
    updatedAt: "2026-08-20T00:00:00.000Z"
  };
}

function harness(initial: readonly RoommateRequestRecord[] = []) {
  const profiles = new Map<number, RoommateProfileRecord>([
    [tenant.userId, profile(tenant.userId)],
    [otherTenant.userId, profile(otherTenant.userId)]
  ]);
  const requests = new Map(initial.map((item) => [item.id, item]));
  const repository = {
    async findProfile(_executor: SqlExecutor, tenantId: number) {
      return profiles.get(tenantId) ?? null;
    },
    async upsertProfile(_executor: SqlExecutor, tenantId: number, input: RoommateProfileRecord) {
      const value = profile(tenantId);
      const next = Object.freeze({ ...value, ...input });
      profiles.set(tenantId, next);
      return next;
    },
    async lockTenant() {},
    async findRequestById(_executor: SqlExecutor, requestId: number) {
      return requests.get(requestId) ?? null;
    },
    async findOwnedRequest(_executor: SqlExecutor, ownerTenantId: number, requestId: number) {
      const value = requests.get(requestId);
      return value?.ownerTenantId === ownerTenantId ? value : null;
    },
    async findOpenRequestForOwner(_executor: SqlExecutor, ownerTenantId: number) {
      return (
        [...requests.values()].find((value) => value.ownerTenantId === ownerTenantId && value.status === "OPEN") ?? null
      );
    },
    async createRequest(_executor: SqlExecutor, ownerTenantId: number, input: RoommateRequestRecord) {
      const value = request(Math.max(0, ...requests.keys(), 0) + 1, ownerTenantId, input);
      requests.set(value.id, value);
      return value;
    },
    async updateRequest(_executor: SqlExecutor, requestId: number, input: Partial<RoommateRequestRecord>) {
      const value = Object.freeze({ ...requests.get(requestId)!, ...input, updatedAt: "2026-08-27T12:00:01.000Z" });
      requests.set(requestId, value);
      return value;
    },
    async cancelRequest(_executor: SqlExecutor, requestId: number) {
      const current = requests.get(requestId);
      if (!current || current.status !== "OPEN") return null;
      const value = Object.freeze({ ...current, status: "CANCELLED", updatedAt: "2026-08-27T12:00:01.000Z" });
      requests.set(requestId, value);
      return value;
    },
    async renewRequest(_executor: SqlExecutor, requestId: number) {
      const value = Object.freeze({
        ...requests.get(requestId)!,
        status: "OPEN",
        expiresAt: "2026-09-26T12:00:00.000Z"
      });
      requests.set(requestId, value);
      return value;
    },
    async linkListing(_executor: SqlExecutor, requestId: number, listingId: number) {
      const value = Object.freeze({
        ...requests.get(requestId)!,
        listingId,
        listingLinkedAt: "2026-08-27T12:00:00.000Z"
      });
      requests.set(requestId, value);
      return value;
    },
    async unlinkListing(_executor: SqlExecutor, requestId: number) {
      const value = Object.freeze({ ...requests.get(requestId)!, listingId: null, listingLinkedAt: null });
      requests.set(requestId, value);
      return value;
    },
    async listOwnedRequests(_executor: SqlExecutor, ownerTenantId: number) {
      return [...requests.values()].filter((value) => value.ownerTenantId === ownerTenantId);
    },
    async listDiscoveryCandidates() {
      return [...requests.values()]
        .filter((value) => value.status === "OPEN" && value.ownerTenantId !== tenant.userId)
        .map((value) => ({ ...value, profile: profiles.get(value.ownerTenantId)! }));
    },
    async isPairBlocked() {
      return false;
    },
    async hasAcceptedConnection() {
      return false;
    },
    async materializeExpired(_executor: SqlExecutor, requestId: number) {
      const current = requests.get(requestId);
      if (!current || current.status !== "OPEN") return false;
      requests.set(requestId, Object.freeze({ ...current, status: "EXPIRED" }));
      return true;
    },
    async sweepExpired() {
      return 0;
    },
    async createDueExpiryReminders() {
      return 0;
    },
    async rejectPendingInterests() {
      return 0;
    }
  } as unknown as RoommateRepository;
  const identities: IdentityRoommateTenantProjection[] = [
    { tenantId: tenant.userId, role: "TENANT", isActive: true, displayName: "Tenant", memberSince: "2026-01" },
    { tenantId: otherTenant.userId, role: "TENANT", isActive: true, displayName: "Other", memberSince: "2026-01" }
  ];
  const service = createRoommateService({
    repository,
    identityAccountClient: { loadRoommateTenantProjectionsByIds: async () => identities },
    listingCatalogClient: { loadPublicSummariesByIds: async (ids) => (ids.includes(7) ? [listing(7)] : []) },
    transactionRunner: { run: (operation) => operation(executor) },
    now: () => now
  });
  return { service, requests };
}

test("requires tenant role and a complete profile before creating a request", async () => {
  const subject = harness();
  await assert.rejects(
    () =>
      subject.service.createRequest(landlord, {
        listingId: null,
        preferredAreaKeys: ["Quan 1"],
        budgetMinPerPerson: 1_000_000,
        budgetMaxPerPerson: 2_000_000,
        moveInFrom: "2026-09-01",
        moveInUntil: "2026-09-30",
        note: null
      }),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
});

test("materializes expired open requests before enforcing the one-open invariant", async () => {
  const expired = request(1, tenant.userId, { expiresAt: "2026-08-27T11:00:00.000Z" });
  const subject = harness([expired]);
  const created = await subject.service.createRequest(tenant, {
    listingId: null,
    preferredAreaKeys: ["Quan 1"],
    budgetMinPerPerson: 1_000_000,
    budgetMaxPerPerson: 2_000_000,
    moveInFrom: "2026-09-01",
    moveInUntil: "2026-09-30",
    note: null
  });
  assert.equal(created.status, "OPEN");
  assert.equal(subject.requests.get(1)?.status, "EXPIRED");
});

test("discovery excludes the caller and decorates public-safe identity/listing projections", async () => {
  const subject = harness([
    request(1, tenant.userId),
    request(2, otherTenant.userId, { listingId: 7, listingLinkedAt: "2026-08-20T00:00:00.000Z" })
  ]);
  const page = await subject.service.listDiscovery(tenant, {
    area: null,
    budgetMinPerPerson: null,
    budgetMaxPerPerson: null,
    moveInFrom: null,
    moveInUntil: null,
    listingMode: "ALL",
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.equal(page.data.length, 1);
  assert.equal(page.data[0]?.profile?.displayName, "Other");
  assert.equal("ownerTenantId" in (page.data[0] ?? {}), false);
  assert.equal(page.data[0]?.listing?.id, 7);
});
