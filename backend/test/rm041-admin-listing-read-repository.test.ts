import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createAdminListingReadRepository } from "../src/modules/listings/admin-listing-read-repository.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

function fixture(...results: QueryResult<QueryResultRow>[]) {
  const queries: ParameterizedQuery[] = [];
  const executor = {
    query: vi.fn(async (query: ParameterizedQuery) => {
      queries.push(query);
      const next = results.shift();
      if (!next) throw new Error("Unexpected query.");
      return next;
    })
  } as unknown as SqlExecutor;
  return { repository: createAdminListingReadRepository(executor), queries };
}

const summaryRow = {
  id: 42,
  status: "PENDING",
  title: "Studio",
  area_name: "District 1",
  landlord_id: 17,
  landlord_email: "owner@example.com",
  landlord_phone: "+84901234567",
  landlord_is_active: false,
  updated_at: "2026-08-09T07:15:00.000Z"
};

const detailRow = {
  id: 42,
  status: "APPROVED",
  title: "Studio",
  description: "Description",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  address_text: "Exact address",
  area_name: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  created_at: "2026-08-08T07:15:00.000Z",
  updated_at: "2026-08-09T07:15:00.000Z",
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  landlord_id: 17,
  landlord_role: "LANDLORD",
  landlord_email: "owner@example.com",
  landlord_phone: "+84901234567",
  landlord_is_active: false
};

function normalized(query: ParameterizedQuery): string {
  return query.text.replace(/\s+/g, " ").trim();
}

describe("RM-041 admin listing read repository", () => {
  it("uses one narrow status queue query with inactive landlords, stable order, and limit plus one", async () => {
    const test = fixture(result([summaryRow]));
    await expect(test.repository.findListingPage({ status: "PENDING", limit: 21, offset: 40 })).resolves.toHaveLength(
      1
    );
    expect(test.queries).toHaveLength(1);
    expect(test.queries[0]!.values).toStrictEqual(["PENDING", 21, 40]);
    const sql = normalized(test.queries[0]!);
    expect(sql).toContain("JOIN users AS landlord ON landlord.id = l.landlord_id");
    expect(sql).toContain("WHERE l.status = $1::listing_status");
    expect(sql).toContain("ORDER BY l.updated_at DESC, l.id DESC LIMIT $2 OFFSET $3");
    expect(sql).not.toMatch(/landlord\.is_active\s*=|COUNT\s*\(|address_text|latitude|cloudinary|SELECT \*/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|FOR UPDATE|BEGIN)\b/i);
  });

  it("loads an unscoped exact admin detail base without public, owner, or activity predicates", async () => {
    const test = fixture(result([detailRow]));
    const base = await test.repository.findListingDetailBase(42);
    expect(base).toMatchObject({
      listing: { id: 42, latitude: 10.772341 },
      landlord: { id: 17, role: "LANDLORD", isActive: false }
    });
    expect(test.queries[0]!.values).toStrictEqual([42]);
    const sql = normalized(test.queries[0]!);
    expect(sql).toContain("WHERE l.id = $1 LIMIT 1");
    expect(sql).not.toMatch(/landlord_id\s*=\s*\$2|status\s*=\s*'APPROVED'|landlord\.is_active\s*=/i);
    expect(sql).not.toMatch(/password_hash|cloudinary_public_id/i);
  });

  it("loads retired amenities, owner images, and current reason in bounded narrow queries", async () => {
    const test = fixture(
      result([{ code: "WIFI", label: "Wi-Fi" }]),
      result([
        {
          id: 91,
          secure_url: "https://cdn.example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byte_size: 1000,
          display_order: 1,
          alt_text: null,
          created_at: "2026-08-09T07:15:00.000Z"
        }
      ]),
      result([{ reason: "Latest" }])
    );
    await test.repository.findAmenitiesForListing(42);
    await test.repository.findImagesForListing(42);
    await test.repository.findCurrentModerationReason(42, "HIDDEN");
    expect(test.queries).toHaveLength(3);
    expect(normalized(test.queries[0]!)).not.toContain("is_active");
    expect(normalized(test.queries[1]!)).not.toContain("cloudinary_public_id");
    expect(normalized(test.queries[2]!)).toContain("ORDER BY created_at DESC, id DESC LIMIT 1");
  });

  it("distinguishes missing listing from an empty ordered history page in two read-only queries", async () => {
    const missing = fixture(result([]));
    await expect(missing.repository.listingExists(99)).resolves.toBe(false);
    expect(missing.queries).toHaveLength(1);

    const existing = fixture(
      result([{ id: 42 }]),
      result([
        {
          id: 301,
          listing_id: 42,
          admin_id: 3,
          previous_status: "PENDING",
          new_status: "APPROVED",
          reason: null,
          created_at: "2026-08-09T07:15:00.000Z"
        }
      ])
    );
    expect(await existing.repository.listingExists(42)).toBe(true);
    await expect(
      existing.repository.findModerationHistoryPage({ listingId: 42, limit: 21, offset: 20 })
    ).resolves.toHaveLength(1);
    expect(existing.queries).toHaveLength(2);
    expect(existing.queries[1]!.values).toStrictEqual([42, 21, 20]);
    const sql = normalized(existing.queries[1]!);
    expect(sql).toContain("ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3");
    expect(sql).not.toMatch(/JOIN users|COUNT\s*\(|password|email|phone|\b(?:INSERT|UPDATE|DELETE|FOR UPDATE)\b/i);
  });
});
