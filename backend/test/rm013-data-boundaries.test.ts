import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { queryExactlyOne, queryMany, queryOptional } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { mapPgTimestamptz, mapPgWholeNumeric } from "../src/db/value-mappers.js";
import { formatApiTimestamp } from "../src/shared/mapping/api-values.js";
import {
  createSyntheticDataBoundaryRow,
  syntheticFixedTimestamp,
  type SyntheticDataBoundaryRow
} from "./helpers/synthetic-data-boundary-fixture.js";

interface SyntheticListing {
  readonly id: number;
  readonly monthlyRent: number;
  readonly createdAt: Date;
  readonly summaryText: string | null;
  readonly contactPhone: string | null;
  readonly ownerEmail: string;
  readonly passwordHash: string;
  readonly providerPublicId: string;
  readonly amenities: readonly string[];
}

interface SyntheticPublicListing {
  readonly id: number;
  readonly monthlyRent: number;
  readonly createdAt: Date;
  readonly summaryText: string | null;
  readonly amenities: readonly string[];
}

interface SyntheticTenantListing extends SyntheticPublicListing {
  readonly contactPhone: string | null;
}

interface SyntheticPublicListingDto {
  readonly id: number;
  readonly monthlyRent: number;
  readonly createdAt: string;
  readonly summary: string | null;
  readonly amenities: readonly string[];
}

interface SyntheticTenantListingDto extends SyntheticPublicListingDto {
  readonly contactPhone: string | null;
}

function mapSyntheticRowToListing(row: Readonly<SyntheticDataBoundaryRow>): SyntheticListing {
  return Object.freeze({
    id: row.listing_id,
    monthlyRent: mapPgWholeNumeric(row.monthly_rent, "monthly_rent"),
    createdAt: mapPgTimestamptz(row.created_at, "created_at"),
    summaryText: row.summary_text,
    contactPhone: row.contact_phone,
    ownerEmail: row.owner_email,
    passwordHash: row.password_hash,
    providerPublicId: row.cloudinary_public_id,
    amenities: Object.freeze([...row.amenity_codes])
  });
}

function selectSyntheticPublicListing(listing: Readonly<SyntheticListing>): SyntheticPublicListing {
  return Object.freeze({
    id: listing.id,
    monthlyRent: listing.monthlyRent,
    createdAt: new Date(listing.createdAt.getTime()),
    summaryText: listing.summaryText,
    amenities: Object.freeze([...listing.amenities])
  });
}

function selectSyntheticTenantListing(listing: Readonly<SyntheticListing>): SyntheticTenantListing {
  return Object.freeze({
    id: listing.id,
    monthlyRent: listing.monthlyRent,
    createdAt: new Date(listing.createdAt.getTime()),
    summaryText: listing.summaryText,
    amenities: Object.freeze([...listing.amenities]),
    contactPhone: listing.contactPhone
  });
}

function mapSyntheticListingToPublicDto(listing: Readonly<SyntheticPublicListing>): SyntheticPublicListingDto {
  return Object.freeze({
    id: listing.id,
    monthlyRent: listing.monthlyRent,
    createdAt: formatApiTimestamp(listing.createdAt),
    summary: listing.summaryText,
    amenities: Object.freeze([...listing.amenities])
  });
}

function mapSyntheticListingToTenantDto(listing: Readonly<SyntheticTenantListing>): SyntheticTenantListingDto {
  return Object.freeze({
    id: listing.id,
    monthlyRent: listing.monthlyRent,
    createdAt: formatApiTimestamp(listing.createdAt),
    summary: listing.summaryText,
    amenities: Object.freeze([...listing.amenities]),
    contactPhone: listing.contactPhone
  });
}

function compileTimeMapperRequirement(executor: SqlExecutor, query: ParameterizedQuery): void {
  // @ts-expect-error RM-013 requires an explicit database-row mapper.
  void queryMany(executor, query);
  // @ts-expect-error RM-013 requires an explicit database-row mapper.
  void queryOptional(executor, query);
  // @ts-expect-error RM-013 requires an explicit database-row mapper.
  void queryExactlyOne(executor, query);
}
void compileTimeMapperRequirement;

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}

describe("RM-013 explicit data boundaries", () => {
  it("maps a snake-case row through an application model into an exact public DTO", () => {
    const row = createSyntheticDataBoundaryRow();
    const rowSnapshot = JSON.stringify(row);
    const application = mapSyntheticRowToListing(row);
    const publicProjection = selectSyntheticPublicListing(application);
    const dto = mapSyntheticListingToPublicDto(publicProjection);

    expect(application).toMatchObject({
      id: 13_013,
      monthlyRent: 1_250_000,
      createdAt: new Date(syntheticFixedTimestamp),
      summaryText: null
    });
    expect(Object.keys(application)).not.toEqual(expect.arrayContaining(["listing_id", "monthly_rent", "created_at"]));
    expect(Object.keys(publicProjection)).toStrictEqual(["id", "monthlyRent", "createdAt", "summaryText", "amenities"]);
    expect(Object.keys(dto)).toStrictEqual(["id", "monthlyRent", "createdAt", "summary", "amenities"]);
    expect(dto).toStrictEqual({
      id: 13_013,
      monthlyRent: 1_250_000,
      createdAt: syntheticFixedTimestamp,
      summary: null,
      amenities: ["WIFI", "FURNISHED"]
    });
    expect(JSON.stringify(dto)).toBe(
      '{"id":13013,"monthlyRent":1250000,"createdAt":"2030-01-02T03:04:05.006Z","summary":null,"amenities":["WIFI","FURNISHED"]}'
    );
    expect(JSON.stringify(row)).toBe(rowSnapshot);
    expect(Object.isFrozen(application)).toBe(true);
    expect(Object.isFrozen(dto)).toBe(true);
    expect(Object.isFrozen(dto.amenities)).toBe(true);
    expect(application.amenities).not.toBe(row.amenity_codes);
    expect(dto.amenities).not.toBe(publicProjection.amenities);

    for (const forbiddenField of [
      "contactPhone",
      "ownerEmail",
      "passwordHash",
      "providerPublicId",
      "cloudinary_public_id",
      "password_hash"
    ]) {
      expect(Object.hasOwn(dto, forbiddenField)).toBe(false);
      expect(JSON.stringify(dto)).not.toContain(forbiddenField);
    }
  });

  it("uses a separate explicit mapper for the permitted synthetic tenant enrichment", () => {
    const application = mapSyntheticRowToListing(createSyntheticDataBoundaryRow());
    const publicDto = mapSyntheticListingToPublicDto(selectSyntheticPublicListing(application));
    const tenantDto = mapSyntheticListingToTenantDto(selectSyntheticTenantListing(application));

    expect(Object.hasOwn(publicDto, "contactPhone")).toBe(false);
    expect(Reflect.get(publicDto, "contactPhone")).toBeUndefined();
    expect(Object.keys(tenantDto)).toStrictEqual([
      "id",
      "monthlyRent",
      "createdAt",
      "summary",
      "amenities",
      "contactPhone"
    ]);
    expect(tenantDto.contactPhone).toBe("+84900000000");
  });

  it("does not leak extra database fields through positive construction", () => {
    const row = createSyntheticDataBoundaryRow({ unexpected_database_secret: "fake-private-extra" });
    const dto = mapSyntheticListingToPublicDto(selectSyntheticPublicListing(mapSyntheticRowToListing(row)));

    expect(Object.hasOwn(dto, "unexpected_database_secret")).toBe(false);
    expect(JSON.stringify(dto)).not.toContain("fake-private-extra");
  });

  it("formats only valid Dates without mutating their instant", () => {
    const source = new Date("2031-04-05T06:07:08.009+07:00");
    const originalTime = source.getTime();

    expect(formatApiTimestamp(source)).toBe("2031-04-04T23:07:08.009Z");
    expect(source.getTime()).toBe(originalTime);
    expect(() => formatApiTimestamp(new Date(Number.NaN))).toThrow(TypeError);
    expect(() => formatApiTimestamp(syntheticFixedTimestamp as unknown as Date)).toThrow(TypeError);
    expectTypeOf(formatApiTimestamp).parameter(0).toEqualTypeOf<Date>();
    expectTypeOf(formatApiTimestamp).returns.toEqualTypeOf<string>();
  });

  it("requires one explicit mapper call with exactly one row argument", async () => {
    const row = createSyntheticDataBoundaryRow();
    const query = vi.fn().mockResolvedValue(queryResult([row]));
    const executor = { query } as unknown as SqlExecutor;
    const mapper = vi.fn(mapSyntheticRowToListing);

    const mapped = await queryMany(executor, { text: "SELECT synthetic", values: [] }, mapper);

    expect(mapped).toHaveLength(1);
    expect(mapper).toHaveBeenCalledOnce();
    expect(mapper.mock.calls[0]).toStrictEqual([row]);
  });
});

describe("RM-013 deterministic fixture convention", () => {
  it("uses deterministic, fixed, and clearly fake defaults", () => {
    const first = createSyntheticDataBoundaryRow();
    const second = createSyntheticDataBoundaryRow();

    expect(first).toStrictEqual(second);
    expect(first.created_at).toBe(syntheticFixedTimestamp);
    expect(first.owner_email).toMatch(/@example\.invalid$/);
    expect(first.password_hash).toContain("fake");
    expect(first.cloudinary_public_id).toContain("fake");
  });

  it("creates separate frozen objects and nested values for every call", () => {
    const first = createSyntheticDataBoundaryRow();
    const second = createSyntheticDataBoundaryRow();

    expect(first).not.toBe(second);
    expect(first.amenity_codes).not.toBe(second.amenity_codes);
    expect(first.provider_metadata).not.toBe(second.provider_metadata);
    expect(first.provider_metadata.tags).not.toBe(second.provider_metadata.tags);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.amenity_codes)).toBe(true);
    expect(Object.isFrozen(first.provider_metadata)).toBe(true);
    expect(Object.isFrozen(first.provider_metadata.tags)).toBe(true);
    expect(Reflect.set(first.amenity_codes, "0", "CHANGED")).toBe(false);
    expect(second.amenity_codes).toStrictEqual(["WIFI", "FURNISHED"]);
  });

  it("supports explicit overrides without sharing caller-owned nested values", () => {
    const amenities = ["PARKING"];
    const tags = ["override"];
    const fixture = createSyntheticDataBoundaryRow({
      monthly_rent: "2500000",
      summary_text: "Synthetic override",
      amenity_codes: amenities,
      provider_metadata: { provider: "override.example.invalid", tags }
    });

    amenities.push("WIFI");
    tags.push("changed");

    expect(fixture).toMatchObject({ monthly_rent: "2500000", summary_text: "Synthetic override" });
    expect(fixture.amenity_codes).toStrictEqual(["PARKING"]);
    expect(fixture.provider_metadata.tags).toStrictEqual(["override"]);
  });

  it("distinguishes omitted, explicit undefined, and explicit null properties", () => {
    const omitted = createSyntheticDataBoundaryRow();
    const undefinedValue = createSyntheticDataBoundaryRow({ optional_note: undefined });
    const nullValue = createSyntheticDataBoundaryRow({ optional_note: null });

    expect(Object.hasOwn(omitted, "optional_note")).toBe(false);
    expect(Object.hasOwn(undefinedValue, "optional_note")).toBe(true);
    expect(undefinedValue.optional_note).toBeUndefined();
    expect(Object.hasOwn(nullValue, "optional_note")).toBe(true);
    expect(nullValue.optional_note).toBeNull();
  });
});
