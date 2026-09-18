import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import {
  createAdminListingDetail,
  mapAdminListingDetailRow,
  mapAdminListingDetailToDto
} from "../src/modules/listings/mappers/admin-listing-detail-mapper.js";
import {
  createAdminListingReadRepository,
  type AdminListingReadRepository
} from "../src/modules/listings/repositories/admin-listing-read-repository.js";
import { createAdminListingReadService } from "../src/modules/listings/services/admin-listing-read-service.js";

const admin: AuthenticatedPrincipal = { userId: 1, role: "ADMIN" };
const tenant: AuthenticatedPrincipal = { userId: 2, role: "TENANT" };

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    status: "PENDING",
    business_status: "AVAILABLE",
    title: "Studio sáng",
    description: "Mô tả",
    monthly_rent: "5000000",
    room_area_sqm: "20.00",
    max_occupants: 2,
    address_text: "12 Đường Chính Xác",
    area_name: "Quận 1",
    latitude: 10.77123,
    longitude: 106.70123,
    availability_confirmed_at: null,
    availability_reminder_sent_at: null,
    availability_reminder_notified_at: null,
    availability_auto_paused_at: null,
    property_type_code: "ROOM",
    property_type_label: "Phòng",
    landlord_id: 7,
    landlord_role: "LANDLORD",
    landlord_email: "owner@example.com",
    landlord_phone: "+84901234567",
    landlord_is_active: true,
    open_report_count: 0,
    possible_duplicate: false,
    created_at: new Date("2026-08-25T00:00:00.000Z"),
    updated_at: new Date("2026-08-26T00:00:00.000Z"),
    ...overrides
  };
}

function detailDto(overrides: Record<string, unknown> = {}) {
  const base = mapAdminListingDetailRow(detailRow(overrides));
  return mapAdminListingDetailToDto(createAdminListingDetail(base, [], [], null));
}

function repository(overrides: Partial<AdminListingReadRepository> = {}): AdminListingReadRepository {
  return {
    async findListingPage() {
      return [];
    },
    async findListingDetailBase() {
      return null;
    },
    async findAmenitiesForListing() {
      return [];
    },
    async findImagesForListing() {
      return [];
    },
    async findCurrentModerationReason() {
      return null;
    },
    async listingExists() {
      return false;
    },
    async findModerationHistoryPage() {
      return [];
    },
    ...overrides
  };
}

test("admin listing detail maps zero reports and a negative duplicate signal", () => {
  const dto = detailDto();

  assert.equal(dto.openReportCount, 0);
  assert.equal(dto.possibleDuplicate, false);
});

test("admin listing detail maps open reports and a positive duplicate signal without report data", () => {
  const dto = detailDto({ open_report_count: 3, possible_duplicate: true });

  assert.equal(dto.openReportCount, 3);
  assert.equal(dto.possibleDuplicate, true);
  assert.equal("reporterId" in dto, false);
  assert.equal("reporterEmail" in dto, false);
  assert.equal("reportContent" in dto, false);
  assert.equal("reports" in dto, false);
});

test("admin listing detail query uses the queue's report and duplicate semantics", async () => {
  const queries: ParameterizedQuery[] = [];
  const profileLoads: number[][] = [];
  const executor: SqlExecutor = {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      queries.push(query);
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [detailRow({ open_report_count: 2, possible_duplicate: true })] as unknown as Row[]
      };
    }
  };
  const repository = createAdminListingReadRepository(executor, {
    async loadLandlordProfiles(userIds) {
      profileLoads.push([...userIds]);
      return [
        {
          id: 7,
          role: "LANDLORD",
          email: "owner@example.com",
          phone: "+84901234567",
          isActive: true
        }
      ];
    }
  });

  const detail = await repository.findListingDetailBase(42);

  assert.equal(detail?.signals.openReportCount, 2);
  assert.equal(detail?.signals.possibleDuplicate, true);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.values, [42]);
  assert.deepEqual(profileLoads, [[7]]);
  assert.match(queries[0]?.text ?? "", /report\.status IN \('OPEN', 'INVESTIGATING'\)/);
  assert.match(queries[0]?.text ?? "", /duplicate\.landlord_id = l\.landlord_id/);
  assert.match(queries[0]?.text ?? "", /duplicate\.id <> l\.id/);
  assert.match(queries[0]?.text ?? "", /LOWER\(BTRIM\(duplicate\.title\)\) = LOWER\(BTRIM\(l\.title\)\)/);
});

test("admin listing detail remains restricted to admins", async () => {
  let detailReads = 0;
  const service = createAdminListingReadService(
    repository({
      async findListingDetailBase() {
        detailReads += 1;
        return null;
      }
    })
  );

  await assert.rejects(
    service.getAdminListingDetail(tenant, 42),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  assert.equal(detailReads, 0);
});

test("admin listing detail preserves not-found behavior", async () => {
  const service = createAdminListingReadService(repository());

  await assert.rejects(
    service.getAdminListingDetail(admin, 404),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});
