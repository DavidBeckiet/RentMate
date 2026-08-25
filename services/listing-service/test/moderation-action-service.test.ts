import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  EngagementNotificationClient,
  ListingModerationNotificationInput
} from "../../shared/engagement-notification-client.js";
import type { ModerationHistoryItem } from "../src/modules/listings/mappers/moderation-history-mapper.js";
import type {
  LockedModerationListing,
  ModerationActionRepository
} from "../src/modules/listings/repositories/moderation-action-repository.js";
import { createModerationActionService } from "../src/modules/listings/services/moderation-action-service.js";
import type { TransactionRunner } from "../src/modules/listings/services/listing-create-service.js";
import type { ModerationActionInput } from "../src/modules/listings/validations/moderation-action-validation.js";

const admin: AuthenticatedPrincipal = Object.freeze({ userId: 3, role: "ADMIN" });
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

function setup(status: LockedModerationListing["status"], notificationFailure = false) {
  const notifications: ListingModerationNotificationInput[] = [];
  const publishedListingIds: number[] = [];
  const warnings: unknown[] = [];
  const listing: LockedModerationListing = Object.freeze({ id: 42, landlordId: 30, status });
  const repository: ModerationActionRepository = {
    lockListing: async () => listing,
    transitionStatus: async () => true,
    insertHistory: async (input): Promise<ModerationHistoryItem> =>
      Object.freeze({
        id: 301,
        listingId: input.listingId,
        adminId: input.adminId,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        reason: input.reason,
        createdAt: new Date("2026-08-25T00:00:00.000Z")
      })
  };
  const notificationClient: EngagementNotificationClient = {
    notifyListingModerationResult: async (input) => {
      notifications.push(input);
      if (notificationFailure) throw new Error("Engagement unavailable.");
    },
    notifyListingPublished: async ({ listingId }) => {
      publishedListingIds.push(listingId);
    }
  };
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const service = createModerationActionService({
    transactionRunner,
    repositoryFactory: () => repository,
    notificationClient,
    logger: { warn: (...args: unknown[]) => warnings.push(args) }
  });
  return { service, notifications, publishedListingIds, warnings };
}

const cases = [
  ["APPROVE", "PENDING", "APPROVED", "LISTING_APPROVED"],
  ["REJECT", "PENDING", "REJECTED", "LISTING_REJECTED"],
  ["HIDE", "APPROVED", "HIDDEN", "LISTING_HIDDEN"],
  ["RESTORE", "HIDDEN", "APPROVED", "LISTING_APPROVED"]
] as const;

test("sends one notification for every completed moderation transition", async () => {
  for (const [action, source, target, eventType] of cases) {
    const fixture = setup(source);
    const history = await fixture.service.moderateListing(admin, 42, {
      action,
      reason: null
    } satisfies ModerationActionInput);

    assert.equal(history.newStatus, target);
    assert.deepEqual(fixture.notifications, [
      {
        landlordId: 30,
        listingId: 42,
        moderationHistoryId: 301,
        eventType
      }
    ]);
    if (target === "APPROVED") assert.deepEqual(fixture.publishedListingIds, [42]);
    else assert.deepEqual(fixture.publishedListingIds, []);
  }
});

test("keeps a successful moderation result when notification delivery fails", async () => {
  const fixture = setup("PENDING", true);

  await assert.doesNotReject(() => fixture.service.moderateListing(admin, 42, { action: "APPROVE", reason: null }));

  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.warnings.length, 1);
});
