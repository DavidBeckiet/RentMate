import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createOwnerListingReadRepository } from "../src/modules/listings/owner-listing-read-repository.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

function executorWith(...results: QueryResult<QueryResultRow>[]): {
  executor: SqlExecutor;
  queries: ParameterizedQuery[];
} {
  const queries: ParameterizedQuery[] = [];
  const query = vi.fn(async (statement: ParameterizedQuery) => {
    queries.push(statement);
    const next = results.shift();
    if (!next) throw new Error("Unexpected repository query.");
    return next;
  });
  return { executor: { query } as unknown as SqlExecutor, queries };
}

const summaryRow = {
  id: 42,
  status: "DRAFT",
  title: null,
  monthly_rent: null,
  area_name: null,
  updated_at: "2026-07-29T07:15:00.000Z",
  property_type_code: null,
  property_type_label: null,
  cover_image_id: null,
  cover_image_url: null,
  cover_image_format: null,
  cover_image_width: null,
  cover_image_height: null,
  cover_image_byte_size: null,
  cover_image_display_order: null,
  cover_image_alt_text: null,
  cover_image_created_at: null,
  current_moderation_reason: null
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
  created_at: "2026-07-28T04:30:00.000Z",
  updated_at: "2026-07-29T07:15:00.000Z",
  property_type_code: "STUDIO",
  property_type_label: "Studio"
};

describe("RM-021 owner listing read repository", () => {
  it("uses one owner-scoped, stable, limit-plus-one collection query with lateral projections", async () => {
    const fixture = executorWith(result([summaryRow]));
    const repository = createOwnerListingReadRepository(fixture.executor);
    const rows = await repository.findOwnerListingPage({ landlordId: 17, status: "DRAFT", limit: 21, offset: 40 });

    expect(rows).toHaveLength(1);
    expect(fixture.queries).toHaveLength(1);
    const statement = fixture.queries[0]!;
    const sql = statement.text.replace(/\s+/g, " ").trim();
    expect(statement.values).toStrictEqual([17, "DRAFT", 21, 40]);
    expect(sql).toContain("WHERE l.landlord_id = $1");
    expect(sql).toContain("$2::listing_status IS NULL OR l.status = $2::listing_status");
    expect(sql).toContain("ORDER BY l.updated_at DESC, l.id DESC LIMIT $3 OFFSET $4");
    expect(sql.match(/LEFT JOIN LATERAL/g)).toHaveLength(2);
    expect(sql).toContain("FROM listing_images");
    expect(sql).toContain("ORDER BY display_order ASC, id ASC LIMIT 1");
    expect(sql).toContain("FROM moderation_history");
    expect(sql).not.toMatch(/COUNT\s*\(|is_active|status = 'APPROVED'|SELECT \*/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|FOR UPDATE)\b/i);
    expect(sql).not.toContain("listing_amenities");
    expect(Object.isFrozen(rows)).toBe(true);
  });

  it("uses the supplied executor and combines listing and landlord predicates for detail", async () => {
    const fixture = executorWith(result([detailRow]));
    const repository = createOwnerListingReadRepository(fixture.executor);
    const detail = await repository.findOwnerListingDetailBase(42, 17);

    expect(detail).toMatchObject({ id: 42, status: "APPROVED", propertyType: { code: "STUDIO" } });
    expect(fixture.queries[0]!.values).toStrictEqual([42, 17]);
    const sql = fixture.queries[0]!.text.replace(/\s+/g, " ");
    expect(sql).toContain("WHERE l.id = $1 AND l.landlord_id = $2 LIMIT 1");
    expect(sql).not.toMatch(/users|is_active|cloudinary|FOR UPDATE/i);
  });

  it("returns null for missing or non-owned detail without association queries", async () => {
    const fixture = executorWith(result([]));
    const repository = createOwnerListingReadRepository(fixture.executor);
    await expect(repository.findOwnerListingDetailBase(99, 17)).resolves.toBeNull();
    expect(fixture.queries).toHaveLength(1);
  });

  it("loads associated retired amenities with one deterministic set query", async () => {
    const fixture = executorWith(
      result([
        { code: "FURNISHED", label: "Furnished" },
        { code: "WIFI", label: "Wi-Fi" }
      ])
    );
    const repository = createOwnerListingReadRepository(fixture.executor);
    const amenities = await repository.findAmenitiesForListing(42);

    expect(amenities).toHaveLength(2);
    const sql = fixture.queries[0]!.text.replace(/\s+/g, " ");
    expect(sql).toContain("JOIN amenities AS a ON a.id = la.amenity_id");
    expect(sql).toContain("WHERE la.listing_id = $1 ORDER BY a.label ASC, a.code ASC");
    expect(sql).not.toContain("is_active");
    expect(fixture.queries[0]!.values).toStrictEqual([42]);
  });

  it("loads private owner images in one query without selecting provider or owner columns", async () => {
    const fixture = executorWith(
      result([
        {
          id: 91,
          secure_url: "https://cdn.example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byte_size: 12345,
          display_order: 1,
          alt_text: null,
          created_at: "2026-07-28T05:00:00.000Z"
        }
      ])
    );
    const repository = createOwnerListingReadRepository(fixture.executor);
    const images = await repository.findImagesForListing(42);

    expect(images[0]).toMatchObject({ id: 91, url: "https://cdn.example.test/image.webp" });
    const sql = fixture.queries[0]!.text.replace(/\s+/g, " ");
    expect(sql).toContain("FROM listing_images WHERE listing_id = $1 ORDER BY display_order ASC, id ASC");
    expect(sql).not.toMatch(/cloudinary_public_id|listing_id\s*,/i);
  });

  it.each(["REJECTED", "HIDDEN"] as const)("loads only the latest applicable %s reason", async (status) => {
    const fixture = executorWith(result([{ reason: "Current reason" }]));
    const repository = createOwnerListingReadRepository(fixture.executor);
    await expect(repository.findCurrentModerationReason(42, status)).resolves.toBe("Current reason");

    const sql = fixture.queries[0]!.text.replace(/\s+/g, " ");
    expect(fixture.queries[0]!.values).toStrictEqual([42, status]);
    expect(sql).toContain("WHERE listing_id = $1 AND new_status = $2");
    expect(sql).toContain("ORDER BY created_at DESC, id DESC LIMIT 1");
    expect(sql).toMatch(/^\s*SELECT reason FROM moderation_history/);
  });
});
