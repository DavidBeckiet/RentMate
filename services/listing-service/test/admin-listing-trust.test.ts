import assert from "node:assert/strict";
import test from "node:test";
import {
  mapAdminListingSummaryRow,
  mapAdminListingSummaryToDto
} from "../src/modules/listings/mappers/admin-listing-summary-mapper.js";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    status: "PENDING",
    business_status: "AVAILABLE",
    title: "Studio sáng",
    area_name: "Quận 1",
    landlord_id: 7,
    landlord_email: "owner@example.com",
    landlord_phone: "+84901234567",
    landlord_is_active: true,
    open_report_count: 2,
    possible_duplicate: true,
    updated_at: new Date("2026-08-25T00:00:00.000Z"),
    ...overrides
  };
}

test("maps admin trust signals without exposing reporter details", () => {
  const summary = mapAdminListingSummaryRow(row());
  assert.equal(summary.openReportCount, 2);
  assert.equal(summary.possibleDuplicate, true);

  const dto = mapAdminListingSummaryToDto(summary);
  assert.deepEqual(dto, {
    id: 42,
    status: "PENDING",
    businessStatus: "AVAILABLE",
    title: "Studio sáng",
    areaName: "Quận 1",
    landlord: {
      id: 7,
      email: "owner@example.com",
      phone: "+84901234567",
      isActive: true
    },
    openReportCount: 2,
    possibleDuplicate: true,
    updatedAt: "2026-08-25T00:00:00.000Z"
  });
  assert.equal("reporterId" in dto, false);
  assert.equal("reporter_id" in dto, false);
});

test("rejects malformed trust signal representations", () => {
  assert.throws(() => mapAdminListingSummaryRow(row({ open_report_count: -1 })), /invalid/i);
  assert.throws(() => mapAdminListingSummaryRow(row({ possible_duplicate: "yes" })), /invalid/i);
});
