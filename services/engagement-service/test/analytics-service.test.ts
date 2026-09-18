import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  AnalyticsRepository,
  LandlordAnalyticsSnapshot
} from "../src/modules/analytics/repositories/analytics-repository.js";
import { createAnalyticsService } from "../src/modules/analytics/services/analytics-service.js";

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 20, role: "LANDLORD" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 10, role: "TENANT" });
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

const snapshot: LandlordAnalyticsSnapshot = Object.freeze({
  sinceAt: "2026-07-26T00:00:00.000Z",
  measuredAt: "2026-08-24T00:00:00.000Z",
  inquiries: 4,
  uniqueTenants: 3,
  respondedInquiries: 3,
  respondedWithin24Hours: 2,
  averageFirstResponseMinutes: 90,
  closedInquiries: 1,
  needsReplyNow: 2,
  views: 12,
  favorites: 4,
  callClicks: 3,
  emailClicks: 2,
  previousPeriod: Object.freeze({
    sinceAt: "2026-06-26T00:00:00.000Z",
    untilAt: "2026-07-26T00:00:00.000Z",
    inquiries: 2,
    views: 8,
    favorites: 2,
    callClicks: 1,
    emailClicks: 1
  }),
  daily: Object.freeze([
    Object.freeze({ date: "2026-08-23", inquiries: 1, firstResponses: 0 }),
    Object.freeze({ date: "2026-08-24", inquiries: 3, firstResponses: 3 })
  ]),
  topListings: Object.freeze([
    Object.freeze({ listingId: 42, inquiries: 3, views: 8, favorites: 2, callClicks: 1, emailClicks: 1 })
  ])
});

test("calculates landlord response rates from an authorized aggregate snapshot", async () => {
  let receivedOwner = 0;
  let receivedDays = 0;
  const repository: AnalyticsRepository = {
    async recordEvent() {},
    async load(_executor, ownerId, days) {
      receivedOwner = ownerId;
      receivedDays = days;
      return snapshot;
    }
  };
  const service = createAnalyticsService({
    repository,
    listingCatalogClient: { loadPublicInquiryTarget: async () => ({ listingId: 77, landlordId: landlord.userId }) },
    transactionRunner: { run: (operation) => operation(executor) }
  });
  const analytics = await service.get(landlord, { period: "30D", days: 30 });
  assert.equal(receivedOwner, landlord.userId);
  assert.equal(receivedDays, 30);
  assert.equal(analytics.responseRate, 75);
  assert.equal(analytics.responseWithin24HoursRate, 50);
  assert.equal(analytics.previousPeriod.inquiries, 2);
  assert.equal(analytics.daily, snapshot.daily);
});

test("returns zero rates for an empty period and rejects other roles before reading data", async () => {
  let reads = 0;
  const repository: AnalyticsRepository = {
    async recordEvent() {},
    async load() {
      reads += 1;
      return { ...snapshot, inquiries: 0, respondedInquiries: 0, respondedWithin24Hours: 0 };
    }
  };
  const service = createAnalyticsService({
    repository,
    listingCatalogClient: { loadPublicInquiryTarget: async () => ({ listingId: 77, landlordId: landlord.userId }) },
    transactionRunner: { run: (operation) => operation(executor) }
  });
  const empty = await service.get(landlord, { period: "7D", days: 7 });
  assert.equal(empty.responseRate, 0);
  assert.equal(empty.responseWithin24HoursRate, 0);
  await assert.rejects(
    () => service.get(tenant, { period: "30D", days: 30 }),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  assert.equal(reads, 1);
});

test("records public engagement events only for a public listing and keeps favorite attribution tenant-only", async () => {
  const events: unknown[] = [];
  const repository: AnalyticsRepository = {
    async recordEvent(_executor, input) {
      events.push(input);
    },
    async load() {
      return snapshot;
    }
  };
  const service = createAnalyticsService({
    repository,
    listingCatalogClient: {
      loadPublicInquiryTarget: async (listingId) => (listingId === 77 ? { listingId, landlordId: 20 } : null)
    },
    transactionRunner: { run: (operation) => operation(executor) }
  });

  await service.trackEvent(undefined, 77, { eventType: "VIEW" });
  await service.trackEvent(tenant, 77, { eventType: "FAVORITE" });
  assert.deepEqual(events, [
    { listingId: 77, landlordId: 20, actorId: null, eventType: "VIEW" },
    { listingId: 77, landlordId: 20, actorId: 10, eventType: "FAVORITE" }
  ]);
  await assert.rejects(
    () => service.trackEvent(undefined, 77, { eventType: "FAVORITE" }),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  await assert.rejects(
    () => service.trackEvent(undefined, 999, { eventType: "VIEW" }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});
