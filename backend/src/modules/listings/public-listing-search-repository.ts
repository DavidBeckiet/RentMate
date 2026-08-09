import type { QueryResultRow } from "pg";
import { queryMany } from "../../db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../../db/sql-executor.js";
import type { OrdinaryPublicListingSearch, OrdinaryPublicSearchSort } from "./public-listing-search-validation.js";
import {
  mapPublicListingSummaryRow,
  type PublicListingSummary,
  type PublicListingSummaryRow
} from "./public-listing-summary-mapper.js";

interface KnownSearchCodeRow extends QueryResultRow {
  readonly kind: unknown;
  readonly code: unknown;
}

export interface KnownSearchCodes {
  readonly propertyTypes: readonly string[];
  readonly amenities: readonly string[];
}

export interface SearchCodeInput {
  readonly propertyType: string | null;
  readonly amenities: readonly string[];
}

export interface PublicListingSearchRepository {
  readonly findKnownSearchCodes: (input: SearchCodeInput) => Promise<KnownSearchCodes>;
  readonly findOrdinaryPage: (search: OrdinaryPublicListingSearch) => Promise<readonly PublicListingSummary[]>;
}

const orders: Readonly<Record<OrdinaryPublicSearchSort, string>> = Object.freeze({
  newest: "updated_at DESC, id DESC",
  rent_asc: "monthly_rent ASC, id ASC",
  rent_desc: "monthly_rent DESC, id DESC"
});

function ordinaryPageQuery(search: OrdinaryPublicListingSearch): ParameterizedQuery {
  const values: unknown[] = [];
  const predicates = ["l.status = 'APPROVED'", "landlord.is_active = true"];
  const parameter = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (search.q !== null) {
    const reference = parameter(search.q);
    predicates.push(
      `(strpos(lower(l.title), lower(${reference})) > 0 OR strpos(lower(l.area_name), lower(${reference})) > 0)`
    );
  }
  if (search.areaName !== null) predicates.push(`strpos(lower(l.area_name), lower(${parameter(search.areaName)})) > 0`);
  if (search.minMonthlyRent !== null) predicates.push(`l.monthly_rent >= ${parameter(search.minMonthlyRent)}`);
  if (search.maxMonthlyRent !== null) predicates.push(`l.monthly_rent <= ${parameter(search.maxMonthlyRent)}`);
  if (search.minRoomAreaSqm !== null) predicates.push(`l.room_area_sqm >= ${parameter(search.minRoomAreaSqm)}`);
  if (search.maxRoomAreaSqm !== null) predicates.push(`l.room_area_sqm <= ${parameter(search.maxRoomAreaSqm)}`);
  if (search.propertyType !== null) predicates.push(`pt.code = ${parameter(search.propertyType)}`);
  if (search.amenities.length > 0) {
    const reference = parameter([...search.amenities]);
    predicates.push(`NOT EXISTS (
      SELECT 1
      FROM unnest(${reference}::text[]) AS requested(code)
      WHERE NOT EXISTS (
        SELECT 1
        FROM listing_amenities AS requested_la
        JOIN amenities AS requested_a ON requested_a.id = requested_la.amenity_id
        WHERE requested_la.listing_id = l.id
          AND requested_a.code = requested.code
      )
    )`);
  }

  const limit = parameter(search.pageSize + 1);
  const offset = parameter(search.offset);
  const order = orders[search.sort];
  return {
    text: `
      WITH page_candidates AS (
        SELECT
          l.id,
          l.title,
          l.monthly_rent,
          l.room_area_sqm,
          l.area_name,
          l.latitude,
          l.longitude,
          l.updated_at,
          pt.code AS property_type_code,
          pt.label AS property_type_label
        FROM listings AS l
        JOIN users AS landlord ON landlord.id = l.landlord_id
        JOIN property_types AS pt ON pt.id = l.property_type_id
        WHERE ${predicates.join("\n          AND ")}
        ORDER BY ${order.replaceAll(/\b(id|updated_at|monthly_rent)\b/g, "l.$1")}
        LIMIT ${limit}
        OFFSET ${offset}
      )
      SELECT
        pc.id,
        pc.title,
        pc.monthly_rent,
        pc.room_area_sqm,
        pc.area_name,
        pc.latitude,
        pc.longitude,
        pc.property_type_code,
        pc.property_type_label,
        COALESCE(amenity_data.items, '[]'::jsonb) AS amenities,
        cover.secure_url AS cover_image_url,
        cover.alt_text AS cover_image_alt_text,
        cover.display_order AS cover_image_display_order,
        pc.updated_at
      FROM page_candidates AS pc
      LEFT JOIN LATERAL (
        SELECT secure_url, alt_text, display_order
        FROM listing_images
        WHERE listing_id = pc.id
        ORDER BY display_order ASC, id ASC
        LIMIT 1
      ) AS cover ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('code', a.code, 'label', a.label)
          ORDER BY a.label ASC, a.code ASC
        ) AS items
        FROM listing_amenities AS la
        JOIN amenities AS a ON a.id = la.amenity_id
        WHERE la.listing_id = pc.id
      ) AS amenity_data ON true
      ORDER BY ${order.replaceAll(/\b(id|updated_at|monthly_rent)\b/g, "pc.$1")}
    `,
    values
  };
}

export function createPublicListingSearchRepository(executor: SqlExecutor): PublicListingSearchRepository {
  return Object.freeze({
    async findKnownSearchCodes(input: SearchCodeInput): Promise<KnownSearchCodes> {
      const rows = await executor.query<KnownSearchCodeRow>({
        text: `
          SELECT 'property_type' AS kind, code
          FROM property_types
          WHERE code = ANY($1::text[])
          UNION ALL
          SELECT 'amenity' AS kind, code
          FROM amenities
          WHERE code = ANY($2::text[])
        `,
        values: [input.propertyType === null ? [] : [input.propertyType], [...input.amenities]]
      });
      const propertyTypes: string[] = [];
      const amenities: string[] = [];
      for (const row of rows.rows) {
        if (typeof row.code !== "string") throw new Error("Known search code representation is invalid.");
        if (row.kind === "property_type") propertyTypes.push(row.code);
        else if (row.kind === "amenity") amenities.push(row.code);
        else throw new Error("Known search code representation is invalid.");
      }
      return Object.freeze({ propertyTypes: Object.freeze(propertyTypes), amenities: Object.freeze(amenities) });
    },

    async findOrdinaryPage(search: OrdinaryPublicListingSearch): Promise<readonly PublicListingSummary[]> {
      return Object.freeze(
        await queryMany<PublicListingSummaryRow, PublicListingSummary>(
          executor,
          ordinaryPageQuery(search),
          mapPublicListingSummaryRow
        )
      );
    }
  });
}
