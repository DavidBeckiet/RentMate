import assert from "node:assert/strict";
import test from "node:test";
import { defaultRoommateRiskConfig, type RoommateRiskConfig } from "../../shared/src/runtime/config/env.js";
import type {
  IdentityRoommateRiskProjection,
  IdentityRoommateTenantProjection
} from "../../shared/identity-account-client.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { RoommateRiskActivity } from "../src/modules/roommate/roommate-risk.js";
import type {
  RoommateReportRecord,
  RoommateSafetyRepository
} from "../src/modules/roommate/repositories/roommate-safety-repository.js";
import { createRoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

const admin: AuthenticatedPrincipal = Object.freeze({ userId: 9000, role: "ADMIN" });
const riskConfig: RoommateRiskConfig = Object.freeze({
  ...defaultRoommateRiskConfig,
  repeatedMessageCounterpartThreshold: 2,
  rapidInterestCountThreshold: 2,
  highMessageCountThreshold: 2,
  highMessageThreadThreshold: 2,
  solicitationCounterpartThreshold: 2,
  reportCountThreshold: 2,
  reporterCountThreshold: 2,
  currentBlockerThreshold: 2
});

const activityBySubject = new Map<number, RoommateRiskActivity>([
  [
    102,
    {
      messages: [
        { id: 21, interestId: 21, counterpartTenantId: 201, body: "Hello", createdAt: "2026-01-04T00:00:00.000Z" },
        { id: 22, interestId: 22, counterpartTenantId: 202, body: "Hello", createdAt: "2026-01-04T00:01:00.000Z" }
      ],
      interests: [],
      reports: [],
      currentBlockers: []
    }
  ]
]);

function report(id: number, createdAt: string, reporterTenantId = 500 + id): RoommateReportRecord {
  return Object.freeze({
    id,
    reporterTenantId,
    requestId: 100 + id,
    messageId: null,
    subjectTenantId: null,
    targetType: "ROOMMATE_REQUEST",
    category: "OTHER",
    details: null,
    evidenceSnapshot: Object.freeze({ kind: "ROOMMATE_REQUEST", requestId: 100 + id }),
    status: "OPEN",
    resolutionNote: null,
    assignedAdminId: null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null
  });
}

function tenantProjection(tenantId: number): IdentityRoommateTenantProjection {
  return Object.freeze({
    tenantId,
    role: "TENANT",
    displayName: `Tenant ${tenantId}`,
    isActive: true,
    memberSince: "2026-01",
    emailVerified: false,
    phoneVerified: false
  });
}

test("admin Roommate reports are globally priority-sorted before pagination and filterable", async () => {
  const reports = [
    report(4, "2026-01-03T00:00:00.000Z"),
    report(3, "2026-01-03T00:00:00.000Z"),
    report(2, "2026-01-02T00:00:00.000Z"),
    report(1, "2026-01-01T00:00:00.000Z")
  ];
  const subjectByReport = new Map(reports.map((value) => [value.id, value.id === 2 ? 102 : 101]));
  const calls: Array<{ readonly limit: number; readonly offset: number }> = [];
  const safetyRepository = {
    async listReports(_executor: unknown, input: { readonly limit: number; readonly offset: number }) {
      calls.push(input);
      return reports.slice(input.offset, input.offset + input.limit);
    },
    async findRiskSubjectTenantIds() {
      return subjectByReport;
    },
    async loadRiskActivity(_executor: unknown, input: { readonly subjectTenantId: number }) {
      return (
        activityBySubject.get(input.subjectTenantId) ?? {
          messages: [],
          interests: [],
          reports: [],
          currentBlockers: []
        }
      );
    }
  } as unknown as RoommateSafetyRepository;
  const identityAccountClient = {
    async loadRoommateTenantProjectionsByIds(ids: readonly number[]) {
      return ids.map(tenantProjection);
    },
    async loadRoommateRiskProjectionsByIds(ids: readonly number[]): Promise<readonly IdentityRoommateRiskProjection[]> {
      return ids.map((tenantId) => ({ tenantId, createdAt: "2025-01-01T00:00:00.000Z" }));
    }
  };
  const service = createRoommateSafetyService({
    roommateRepository: {} as never,
    safetyRepository,
    identityAccountClient,
    riskConfig,
    now: () => new Date("2026-01-05T00:00:00.000Z"),
    transactionRunner: {
      run: (operation) =>
        operation({
          query: async () => {
            throw new Error("not used");
          }
        })
    }
  });

  const firstPage = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 2,
    offset: 0,
    reviewPriority: null
  });
  assert.deepEqual(
    firstPage.data.map((value) => value.id),
    [2, 1]
  );
  assert.equal(firstPage.hasNextPage, true);
  assert.equal(firstPage.data[0]?.riskSummary.reviewPriority, "ELEVATED");
  assert.equal(firstPage.data[0]?.riskSummary.rulesVersion, "ROOMMATE_RISK_V2_1");
  assert.equal(firstPage.data[0]?.riskSummary.flags[0]?.code, "REPEATED_MESSAGE_ACROSS_THREADS");
  assert.equal("body" in (firstPage.data[0]?.riskSummary.flags[0]?.evidenceSummary ?? {}), false);

  const secondPage = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 2,
    pageSize: 2,
    offset: 2,
    reviewPriority: null
  });
  assert.deepEqual(
    secondPage.data.map((value) => value.id),
    [3, 4]
  );
  assert.equal(secondPage.hasNextPage, false);
  assert.deepEqual(
    [...firstPage.data, ...secondPage.data].map((value) => value.id),
    [2, 1, 3, 4]
  );
  assert.equal(new Set([...firstPage.data, ...secondPage.data].map((value) => value.id)).size, reports.length);
  assert.deepEqual([firstPage.page, firstPage.pageSize, firstPage.hasNextPage], [1, 2, true]);
  assert.deepEqual([secondPage.page, secondPage.pageSize, secondPage.hasNextPage], [2, 2, false]);

  const elevatedOnly = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 20,
    offset: 0,
    reviewPriority: "ELEVATED"
  });
  assert.deepEqual(
    elevatedOnly.data.map((value) => value.id),
    [2]
  );
  assert.equal(elevatedOnly.hasNextPage, false);

  const standardOnly = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 20,
    offset: 0,
    reviewPriority: "STANDARD"
  });
  assert.deepEqual(
    standardOnly.data.map((value) => value.id),
    [1, 3, 4]
  );
  assert.deepEqual([standardOnly.page, standardOnly.pageSize, standardOnly.hasNextPage], [1, 20, false]);
  assert.ok(calls.some((value) => value.offset === 0 && value.limit === riskConfig.reportBatchSize));
});

test("Identity risk projection failure produces partial evaluation without dropping Engagement flags", async () => {
  const sourceReport = report(10, "2026-01-04T00:00:00.000Z");
  const safetyRepository = {
    async listReports() {
      return [sourceReport];
    },
    async findRiskSubjectTenantIds() {
      return new Map([[sourceReport.id, 102]]);
    },
    async loadRiskActivity() {
      return activityBySubject.get(102)!;
    }
  } as unknown as RoommateSafetyRepository;
  const service = createRoommateSafetyService({
    roommateRepository: {} as never,
    safetyRepository,
    identityAccountClient: {
      async loadRoommateTenantProjectionsByIds(ids: readonly number[]) {
        return ids.map(tenantProjection);
      },
      async loadRoommateRiskProjectionsByIds() {
        throw new Error("Identity unavailable");
      }
    },
    riskConfig,
    now: () => new Date("2026-01-05T00:00:00.000Z"),
    transactionRunner: {
      run: (operation) =>
        operation({
          query: async () => {
            throw new Error("not used");
          }
        })
    }
  });

  const page = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 20,
    offset: 0,
    reviewPriority: null
  });
  assert.equal(page.data[0]?.riskSummary.partialEvaluation, true);
  assert.equal(
    page.data[0]?.riskSummary.flags.some((flag) => flag.code === "REPEATED_MESSAGE_ACROSS_THREADS"),
    true
  );
  assert.equal(
    page.data[0]?.riskSummary.flags.some((flag) => flag.code === "NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY"),
    false
  );
});
