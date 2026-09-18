import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type {
  RoommateReportEvent,
  RoommateReportRecord,
  RoommateSafetyRepository
} from "../src/modules/roommate/repositories/roommate-safety-repository.js";
import { createRoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

const admin: AuthenticatedPrincipal = { userId: 9, role: "ADMIN" };
const timestamp = "2026-09-16T00:00:00.000Z";

function harness(initialStatus: RoommateReportRecord["status"]) {
  let current: RoommateReportRecord = {
    id: 1,
    reporterTenantId: 2,
    requestId: 3,
    messageId: null,
    subjectTenantId: null,
    targetType: "ROOMMATE_REQUEST",
    category: "SPAM",
    details: null,
    evidenceSnapshot: { kind: "ROOMMATE_REQUEST" },
    status: initialStatus,
    resolutionNote: null,
    assignedAdminId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: null
  };
  const events: RoommateReportEvent[] = [];
  const repository = {
    async findReport() {
      return current;
    },
    async updateReportStatus(
      _executor: SqlExecutor,
      _reportId: number,
      status: RoommateReportRecord["status"],
      adminId: number,
      note: string | null
    ) {
      current = { ...current, status, assignedAdminId: adminId, resolutionNote: note, resolvedAt: timestamp };
      return current;
    },
    async appendReportEvent(
      _executor: SqlExecutor,
      input: {
        readonly reportId: number;
        readonly actorId: number;
        readonly actorRole: "ADMIN";
        readonly previousStatus: RoommateReportRecord["status"] | null;
        readonly newStatus: RoommateReportRecord["status"];
        readonly note: string | null;
      }
    ) {
      const event: RoommateReportEvent = {
        ...input,
        id: events.length + 1,
        eventType: "STATUS",
        subjectType: null,
        subjectId: null,
        createdAt: timestamp
      };
      events.push(event);
      return event;
    },
    async listReportEvents() {
      return events;
    },
    async findRiskSubjectTenantIds() {
      return new Map<number, number>();
    }
  } as unknown as RoommateSafetyRepository;
  const service = createRoommateSafetyService({
    roommateRepository: {} as never,
    safetyRepository: repository,
    identityAccountClient: {
      loadRoommateTenantProjectionsByIds: async () => []
    },
    transactionRunner: {
      run: (operation) =>
        operation({
          query: async () => {
            throw new Error("SQL is not used by this test.");
          }
        })
    },
    now: () => new Date(timestamp)
  });
  return { service, events };
}

test("Roommate reports complete directly from OPEN and both ways from legacy INVESTIGATING", async () => {
  for (const initial of ["OPEN", "INVESTIGATING"] as const) {
    for (const status of ["RESOLVED", "DISMISSED"] as const) {
      const { service, events } = harness(initial);
      const completed = await service.updateAdminReportStatus(admin, 1, { status, note: "Đã xem xét." });
      assert.equal(completed?.status, status);
      assert.deepEqual(
        events.map((event) => [event.previousStatus, event.newStatus]),
        [[initial, status]]
      );
      await assert.rejects(
        () =>
          service.updateAdminReportStatus(admin, 1, {
            status: status === "RESOLVED" ? "DISMISSED" : "RESOLVED",
            note: "Quá muộn."
          }),
        (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
      );
    }
  }
});
