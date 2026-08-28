import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { IdentityRoommateTenantProjection } from "../../shared/identity-account-client.js";
import type { PublicListingSummary } from "../../shared/public-listing-summary.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type {
  RoommateDiscoveryCandidate,
  RoommateProfileRecord,
  RoommateRepository,
  RoommateRequestRecord
} from "../src/modules/roommate/repositories/roommate-repository.js";
import { createRoommateService } from "../src/modules/roommate/services/roommate-service.js";
import type { RoommateDiscoveryQuery } from "../src/modules/roommate/validations/roommate-validation.js";

const executor = {} as SqlExecutor;
const now = new Date("2026-08-27T12:00:00.000Z");

function profile(tenantId: number, overrides: Partial<RoommateProfileRecord> = {}): RoommateProfileRecord {
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
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
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
    note: "private note that must not enter compatibility",
    status: "OPEN",
    expiresAt: "2026-09-26T12:00:00.000Z",
    listingLinkedAt: null,
    moderationState: "VISIBLE",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides
  });
}

function listing(id: number, areaName: string): PublicListingSummary {
  return {
    id,
    businessStatus: "AVAILABLE",
    title: "Room",
    monthlyRent: 3_000_000,
    roomAreaSqm: 20,
    maxOccupants: 2,
    areaName,
    latitude: 10.77,
    longitude: 106.7,
    propertyType: { code: "ROOM", label: "Room" },
    amenities: [],
    coverImage: { url: `https://example.test/${id}.jpg`, altText: null, displayOrder: 1 },
    updatedAt: "2026-08-20T00:00:00.000Z"
  };
}

interface HarnessOptions {
  readonly requests: readonly RoommateRequestRecord[];
  readonly profiles?: readonly RoommateProfileRecord[];
  readonly identities?: readonly IdentityRoommateTenantProjection[];
  readonly listings?: readonly PublicListingSummary[];
  readonly blockedPairs?: readonly (readonly [number, number])[];
  readonly listingFailure?: boolean;
}

function query(overrides: Partial<RoommateDiscoveryQuery> = {}): RoommateDiscoveryQuery {
  return {
    area: null,
    budgetMinPerPerson: null,
    budgetMaxPerPerson: null,
    moveInFrom: null,
    moveInUntil: null,
    listingMode: "ALL",
    page: 1,
    pageSize: 20,
    offset: 0,
    ...overrides
  };
}

function createHarness(options: HarnessOptions) {
  const requests = new Map(options.requests.map((item) => [item.id, item]));
  const profiles = new Map<number, RoommateProfileRecord>(options.profiles?.map((item) => [item.tenantId, item]) ?? []);
  const identities = options.identities ?? [];
  const listings = new Map(options.listings?.map((item) => [item.id, item]) ?? []);
  const blockedPairs = new Set(
    (options.blockedPairs ?? []).map(([left, right]) => `${Math.min(left, right)}:${Math.max(left, right)}`)
  );
  const pairKey = (left: number, right: number) => `${Math.min(left, right)}:${Math.max(left, right)}`;
  const repository = {
    async findProfile(_executor: SqlExecutor, tenantId: number) {
      return profiles.get(tenantId) ?? null;
    },
    async findOpenRequestForOwner(_executor: SqlExecutor, tenantId: number) {
      return (
        [...requests.values()]
          .filter((item) => item.ownerTenantId === tenantId && item.status === "OPEN")
          .sort((left, right) => left.id - right.id)[0] ?? null
      );
    },
    async findRequestById(_executor: SqlExecutor, requestId: number) {
      return requests.get(requestId) ?? null;
    },
    async findOwnedRequest(_executor: SqlExecutor, tenantId: number, requestId: number) {
      const value = requests.get(requestId);
      return value?.ownerTenantId === tenantId ? value : null;
    },
    async isPairBlocked(_executor: SqlExecutor, firstTenantId: number, secondTenantId: number) {
      return blockedPairs.has(pairKey(firstTenantId, secondTenantId));
    },
    async listDiscoveryCandidates(
      _executor: SqlExecutor,
      discoveryQuery: {
        readonly callerTenantId: number;
        readonly now: Date;
        readonly listingMode: "ALL" | "LINKED" | "UNLINKED";
        readonly limit: number;
        readonly offset: number;
      }
    ): Promise<readonly RoommateDiscoveryCandidate[]> {
      return [...requests.values()]
        .filter(
          (item) =>
            item.ownerTenantId !== discoveryQuery.callerTenantId &&
            item.status === "OPEN" &&
            item.moderationState === "VISIBLE" &&
            new Date(item.expiresAt).getTime() > discoveryQuery.now.getTime() &&
            (discoveryQuery.listingMode === "ALL" ||
              (discoveryQuery.listingMode === "LINKED" && item.listingId !== null) ||
              (discoveryQuery.listingMode === "UNLINKED" && item.listingId === null)) &&
            profiles.has(item.ownerTenantId) &&
            !blockedPairs.has(pairKey(discoveryQuery.callerTenantId, item.ownerTenantId))
        )
        .sort((left, right) => {
          const createdOrder = right.createdAt.localeCompare(left.createdAt);
          return createdOrder !== 0 ? createdOrder : right.id - left.id;
        })
        .slice(discoveryQuery.offset, discoveryQuery.offset + discoveryQuery.limit)
        .flatMap((item) => {
          const candidateProfile = profiles.get(item.ownerTenantId);
          return candidateProfile ? [{ ...item, profile: candidateProfile }] : [];
        });
    }
  } as unknown as RoommateRepository;
  const service = createRoommateService({
    repository,
    identityAccountClient: {
      loadRoommateTenantProjectionsByIds: async (tenantIds: readonly number[]) =>
        identities.filter((identity) => tenantIds.includes(identity.tenantId))
    },
    listingCatalogClient: {
      loadPublicSummariesByIds: async (listingIds: readonly number[]) => {
        if (options.listingFailure) throw new Error("listing unavailable");
        return listingIds.flatMap((listingId) => {
          const value = listings.get(listingId);
          return value ? [value] : [];
        });
      }
    },
    transactionRunner: { run: (operation) => operation(executor) },
    now: () => now
  });
  return { service };
}

const tenant = Object.freeze({ userId: 10, role: "TENANT" } satisfies AuthenticatedPrincipal);
const other = Object.freeze({ userId: 20, role: "TENANT" } satisfies AuthenticatedPrincipal);
const identity = (tenantId: number, displayName = `Tenant ${tenantId}`): IdentityRoommateTenantProjection => ({
  tenantId,
  role: "TENANT",
  isActive: true,
  displayName,
  memberSince: "2026-01",
  emailVerified: false,
  phoneVerified: false
});

test("adds compact compatibility after V1 eligibility and keeps category out of candidate ordering", async () => {
  const subject = createHarness({
    requests: [request(1, tenant.userId), request(2, other.userId, { createdAt: "2026-08-20T00:00:00.000Z" })],
    profiles: [profile(tenant.userId), profile(other.userId)],
    identities: [identity(tenant.userId), identity(other.userId)]
  });
  const page = await subject.service.listDiscovery(tenant, query());
  const candidate = page.data[0]!;
  assert.equal(candidate.id, 2);
  assert.equal(candidate.compatibility?.category, "HIGH_ALIGNMENT");
  assert.deepEqual(
    candidate.compatibility?.dimensions.map((item) => item.dimension),
    ["PETS", "SMOKING", "BUDGET"]
  );
  assert.equal(candidate.compatibility?.dimensions.length, 3);
  assert.equal(candidate.compatibility?.evaluatedCount, 8);
});

test("returns null compatibility for an incomplete caller while preserving V1 discovery", async () => {
  const subject = createHarness({
    requests: [request(2, other.userId)],
    profiles: [profile(tenant.userId, { intro: "too short" }), profile(other.userId)],
    identities: [identity(other.userId)]
  });
  const page = await subject.service.listDiscovery(tenant, query());
  assert.equal(page.data.length, 1);
  assert.equal(page.data[0]?.compatibility, null);
});

test("marks missing caller intent dimensions as not evaluated without hiding the candidate", async () => {
  const subject = createHarness({
    requests: [request(2, other.userId)],
    profiles: [profile(tenant.userId), profile(other.userId)],
    identities: [identity(tenant.userId), identity(other.userId)]
  });
  const page = await subject.service.listDiscovery(tenant, query());
  const candidate = page.data[0]!;
  const dimensions = new Map(candidate.compatibility?.dimensions.map((item) => [item.dimension, item]));
  assert.equal(candidate.compatibility?.category, "HIGH_ALIGNMENT");
  assert.equal(candidate.compatibility?.evaluatedCount, 5);
  assert.equal(dimensions.has("BUDGET"), false);
  assert.equal(dimensions.has("AREA"), false);
  assert.equal(dimensions.has("MOVE_IN"), false);
});

test("uses each explicit discovery filter independently before falling back to the caller OPEN request", async () => {
  const subject = createHarness({
    requests: [
      request(1, tenant.userId),
      request(2, other.userId, {
        preferredAreaKeys: ["Thu Duc"],
        budgetMinPerPerson: 4_000_000,
        budgetMaxPerPerson: 5_000_000,
        moveInFrom: "2026-10-01",
        moveInUntil: "2026-10-30"
      }),
      request(3, 30, {
        budgetMinPerPerson: 4_000_000,
        budgetMaxPerPerson: 5_000_000
      })
    ],
    profiles: [profile(tenant.userId), profile(other.userId), profile(30)],
    identities: [identity(tenant.userId), identity(other.userId), identity(30)]
  });
  const page = await subject.service.listDiscovery(
    tenant,
    query({ budgetMinPerPerson: 4_000_000, budgetMaxPerPerson: 5_000_000 })
  );
  const mismatch = page.data.find((item) => item.id === 2)!;
  const fallbackDimensions = new Map(mismatch.compatibility?.dimensions.map((item) => [item.dimension, item]));
  assert.equal(fallbackDimensions.get("AREA")?.outcome, "IMPORTANT_DIFFERENCE");
  assert.equal(fallbackDimensions.get("MOVE_IN")?.outcome, "IMPORTANT_DIFFERENCE");
  const queryOverride = page.data.find((item) => item.id === 3)!;
  const overrideDimensions = new Map(queryOverride.compatibility?.dimensions.map((item) => [item.dimension, item]));
  assert.equal(overrideDimensions.get("BUDGET")?.outcome, "ALIGNED");
});

test("uses current public listing area for linked caller and candidate requests", async () => {
  const subject = createHarness({
    requests: [
      request(1, tenant.userId, { listingId: 7, listingLinkedAt: "2026-08-20T00:00:00.000Z" }),
      request(2, other.userId, { listingId: 8, listingLinkedAt: "2026-08-20T00:00:00.000Z" })
    ],
    profiles: [profile(tenant.userId), profile(other.userId)],
    identities: [identity(tenant.userId), identity(other.userId)],
    listings: [listing(7, "Quan 1"), listing(8, "Thu Duc")]
  });
  const page = await subject.service.listDiscovery(tenant, query());
  const area = page.data[0]?.compatibility?.dimensions.find((item) => item.dimension === "AREA");
  assert.equal(area?.outcome, "IMPORTANT_DIFFERENCE");
  assert.equal("latitude" in (page.data[0]?.compatibility ?? {}), false);
  assert.equal("longitude" in (page.data[0]?.compatibility ?? {}), false);
});

test("keeps chronology and page boundaries independent from compatibility category", async () => {
  const subject = createHarness({
    requests: [
      request(1, tenant.userId),
      request(2, 20, { createdAt: "2026-08-20T00:00:00.000Z" }),
      request(3, 30, { createdAt: "2026-08-21T00:00:00.000Z" }),
      request(4, 40, { createdAt: "2026-08-21T00:00:00.000Z" })
    ],
    profiles: [profile(tenant.userId), profile(20), profile(30), profile(40, { smokingEnvironment: "OUTDOOR_ONLY" })],
    identities: [identity(tenant.userId), identity(20), identity(30), identity(40)],
    blockedPairs: []
  });
  const first = await subject.service.listDiscovery(tenant, query({ page: 1, pageSize: 2 }));
  const second = await subject.service.listDiscovery(tenant, query({ page: 2, pageSize: 2, offset: 2 }));
  assert.deepEqual(
    first.data.map((item) => item.id),
    [4, 3]
  );
  assert.deepEqual(
    second.data.map((item) => item.id),
    [2]
  );
  assert.equal(first.hasNextPage, true);
  assert.equal(second.hasNextPage, false);
  assert.equal(first.data[0]?.compatibility?.category, "IMPORTANT_DIFFERENCE");
});

test("request detail returns full fixed-order compatibility and preserves privacy shape", async () => {
  const subject = createHarness({
    requests: [request(1, tenant.userId), request(2, other.userId)],
    profiles: [profile(tenant.userId), profile(other.userId)],
    identities: [identity(tenant.userId), identity(other.userId)]
  });
  const view = await subject.service.getRequest(tenant, 2);
  assert.deepEqual(
    view.compatibility?.dimensions.map((item) => item.dimension),
    ["SLEEP", "CLEANLINESS", "NOISE", "SMOKING", "PETS", "BUDGET", "AREA", "MOVE_IN"]
  );
  assert.equal(view.compatibility?.dimensions.length, 8);
  assert.equal("ownerTenantId" in (view.compatibility ?? {}), false);
  assert.equal("note" in (view.compatibility ?? {}), false);
  assert.equal("message" in (view.compatibility ?? {}), false);
  assert.equal("email" in (view.compatibility ?? {}), false);
  assert.equal("phone" in (view.compatibility ?? {}), false);
});

test("preserves dependency error semantics for an unavailable linked caller listing", async () => {
  const subject = createHarness({
    requests: [
      request(1, tenant.userId, { listingId: 7, listingLinkedAt: "2026-08-20T00:00:00.000Z" }),
      request(2, other.userId)
    ],
    profiles: [profile(tenant.userId), profile(other.userId)],
    identities: [identity(tenant.userId), identity(other.userId)],
    listingFailure: true
  });
  await assert.rejects(
    () => subject.service.listDiscovery(tenant, query()),
    (error: unknown) => error instanceof ApplicationError && error.code === "DEPENDENCY_UNAVAILABLE"
  );
});

test("does not load an unused linked caller fallback when every intent dimension is explicit", async () => {
  const subject = createHarness({
    requests: [
      request(1, tenant.userId, { listingId: 7, listingLinkedAt: "2026-08-20T00:00:00.000Z" }),
      request(2, other.userId)
    ],
    profiles: [profile(tenant.userId), profile(other.userId)],
    identities: [identity(tenant.userId), identity(other.userId)],
    listingFailure: true
  });
  const page = await subject.service.listDiscovery(
    tenant,
    query({
      area: "Quan 1",
      budgetMinPerPerson: 1_000_000,
      budgetMaxPerPerson: 3_000_000,
      moveInFrom: "2026-09-01",
      moveInUntil: "2026-09-30"
    })
  );
  assert.equal(page.data[0]?.compatibility?.category, "HIGH_ALIGNMENT");
});

test("returns null compatibility on an owner detail with no profile instead of changing V1 visibility", async () => {
  const subject = createHarness({
    requests: [request(1, tenant.userId)],
    profiles: [],
    identities: [identity(tenant.userId)]
  });
  const view = await subject.service.getRequest(tenant, 1);
  assert.equal(view.compatibility, null);
});
