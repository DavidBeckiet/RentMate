import type { QueryResultRow } from "pg";
import { queryMany } from "../../db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../../db/sql-executor.js";
import type {
  BoundsPublicListingSearch,
  OrdinaryPublicListingSearch,
  OrdinaryPublicSearchSort,
  PublicSearchCommonFilters,
  RadiusPublicListingSearch
} from "./public-listing-search-validation.js";
import type { RadiusBoundingBox } from "./public-listing-search-bounding-box.js";
import {
  mapPublicListingSummaryRow,
  mapPublicRadiusListingSummaryRow,
  type PublicRadiusListingSummary,
  type PublicRadiusListingSummaryRow,
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
  readonly findOrdinaryPage: (
    search: OrdinaryPublicListingSearch,
    activeLandlordIds?: readonly number[]
  ) => Promise<readonly PublicListingSummary[]>;
  readonly findBoundsPage: (
    search: BoundsPublicListingSearch,
    activeLandlordIds?: readonly number[]
  ) => Promise<readonly PublicListingSummary[]>;
  readonly findRadiusPage: (
    search: RadiusPublicListingSearch,
    boundingBox: RadiusBoundingBox,
    activeLandlordIds?: readonly number[]
  ) => Promise<readonly PublicRadiusListingSummary[]>;
}

const orders: Readonly<Record<OrdinaryPublicSearchSort, { readonly candidate: string; readonly page: string }>> =
  Object.freeze({
    newest: { candidate: "l.updated_at DESC, l.id DESC", page: "pc.updated_at DESC, pc.id DESC" },
    rent_asc: { candidate: "l.monthly_rent ASC, l.id ASC", page: "pc.monthly_rent ASC, pc.id ASC" },
    rent_desc: { candidate: "l.monthly_rent DESC, l.id DESC", page: "pc.monthly_rent DESC, pc.id DESC" }
  });

interface QueryBuilder {
  readonly values: unknown[];
  readonly parameter: (value: unknown) => string;
}

function createQueryBuilder(): QueryBuilder {
  const values: unknown[] = [];
  return {
    values,
    parameter: (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    }
  };
}

function addCommonPredicates(search: PublicSearchCommonFilters, builder: QueryBuilder, predicates: string[]): void {
  if (search.q !== null) {
    const reference = builder.parameter(search.q);
    predicates.push(
      `(strpos(lower(l.title), lower(${reference})) > 0 OR strpos(lower(l.area_name), lower(${reference})) > 0)`
    );
  }
  if (search.areaName !== null) {
    predicates.push(`strpos(lower(l.area_name), lower(${builder.parameter(search.areaName)})) > 0`);
  }
  if (search.minMonthlyRent !== null) predicates.push(`l.monthly_rent >= ${builder.parameter(search.minMonthlyRent)}`);
  if (search.maxMonthlyRent !== null) predicates.push(`l.monthly_rent <= ${builder.parameter(search.maxMonthlyRent)}`);
  if (search.minRoomAreaSqm !== null) predicates.push(`l.room_area_sqm >= ${builder.parameter(search.minRoomAreaSqm)}`);
  if (search.maxRoomAreaSqm !== null) predicates.push(`l.room_area_sqm <= ${builder.parameter(search.maxRoomAreaSqm)}`);
  if (search.propertyType !== null) predicates.push(`pt.code = ${builder.parameter(search.propertyType)}`);
  if (search.amenities.length > 0) {
    const reference = builder.parameter([...search.amenities]);
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
}

function publicAggregateQuery(prefix: string, order: string, includeDistance: boolean): string {
  const distanceColumn = includeDistance ? ",\n        pc.distance_km" : "";
  return `${prefix}
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
        pc.updated_at${distanceColumn}
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
      ORDER BY ${order}
    `;
}

function ownerVisibilityPredicate(builder: QueryBuilder, activeLandlordIds: readonly number[] | undefined): string {
  if (activeLandlordIds === undefined) return "landlord.is_active = true";
  if (activeLandlordIds.length === 0) return "FALSE";
  return `l.landlord_id = ANY(${builder.parameter([...activeLandlordIds])}::integer[])`;
}

function nonRadiusPageQuery(
  search: OrdinaryPublicListingSearch | BoundsPublicListingSearch,
  activeLandlordIds?: readonly number[]
): ParameterizedQuery {
  const builder = createQueryBuilder();
  const predicates = ["l.status = 'APPROVED'", ownerVisibilityPredicate(builder, activeLandlordIds)];
  if (search.mode === "bounds") {
    predicates.push(`l.latitude >= ${builder.parameter(search.south)}`);
    predicates.push(`l.latitude <= ${builder.parameter(search.north)}`);
    predicates.push(`l.longitude >= ${builder.parameter(search.west)}`);
    predicates.push(`l.longitude <= ${builder.parameter(search.east)}`);
  }
  addCommonPredicates(search, builder, predicates);

  const limit = builder.parameter(search.pageSize + 1);
  const offset = builder.parameter(search.offset);
  const order = orders[search.sort];
  const prefix = `
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
        ${activeLandlordIds === undefined ? "JOIN users AS landlord ON landlord.id = l.landlord_id" : ""}
        JOIN property_types AS pt ON pt.id = l.property_type_id
        WHERE ${predicates.join("\n          AND ")}
        ORDER BY ${order.candidate}
        LIMIT ${limit}
        OFFSET ${offset}
      )`;
  return {
    text: publicAggregateQuery(prefix, order.page, false),
    values: builder.values
  };
}

function radiusPageQuery(
  search: RadiusPublicListingSearch,
  boundingBox: RadiusBoundingBox,
  activeLandlordIds?: readonly number[]
): ParameterizedQuery {
  const builder = createQueryBuilder();
  const predicates = ["l.status = 'APPROVED'", ownerVisibilityPredicate(builder, activeLandlordIds)];
  predicates.push(`l.latitude >= ${builder.parameter(boundingBox.south)}`);
  predicates.push(`l.latitude <= ${builder.parameter(boundingBox.north)}`);
  predicates.push(`l.longitude >= ${builder.parameter(boundingBox.west)}`);
  predicates.push(`l.longitude <= ${builder.parameter(boundingBox.east)}`);
  addCommonPredicates(search, builder, predicates);

  const centerLatitude = builder.parameter(search.centerLat);
  const centerLongitude = builder.parameter(search.centerLng);
  const radius = builder.parameter(search.radiusKm);
  const limit = builder.parameter(search.pageSize + 1);
  const offset = builder.parameter(search.offset);
  const distanceExpression = `
        2 * 6371.0088 * asin(
          sqrt(
            LEAST(
              1.0,
              power(sin(radians(fc.latitude - ${centerLatitude}) / 2), 2)
              + cos(radians(${centerLatitude}))
              * cos(radians(fc.latitude))
              * power(sin(radians(fc.longitude - ${centerLongitude}) / 2), 2)
            )
          )
        )`;
  const prefix = `
      WITH filtered_candidates AS (
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
        ${activeLandlordIds === undefined ? "JOIN users AS landlord ON landlord.id = l.landlord_id" : ""}
        JOIN property_types AS pt ON pt.id = l.property_type_id
        WHERE ${predicates.join("\n          AND ")}
      ),
      distance_candidates AS MATERIALIZED (
        SELECT
          fc.*,
          ${distanceExpression} AS distance_km
        FROM filtered_candidates AS fc
      ),
      radius_matches AS (
        SELECT *
        FROM distance_candidates
        WHERE distance_km <= ${radius}
      ),
      page_candidates AS (
        SELECT *
        FROM radius_matches
        ORDER BY distance_km ASC, id ASC
        LIMIT ${limit}
        OFFSET ${offset}
      )`;
  return {
    text: publicAggregateQuery(prefix, "pc.distance_km ASC, pc.id ASC", true),
    values: builder.values
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

    async findOrdinaryPage(
      search: OrdinaryPublicListingSearch,
      activeLandlordIds?: readonly number[]
    ): Promise<readonly PublicListingSummary[]> {
      return Object.freeze(
        await queryMany<PublicListingSummaryRow, PublicListingSummary>(
          executor,
          nonRadiusPageQuery(search, activeLandlordIds),
          mapPublicListingSummaryRow
        )
      );
    },

    async findBoundsPage(
      search: BoundsPublicListingSearch,
      activeLandlordIds?: readonly number[]
    ): Promise<readonly PublicListingSummary[]> {
      return Object.freeze(
        await queryMany<PublicListingSummaryRow, PublicListingSummary>(
          executor,
          nonRadiusPageQuery(search, activeLandlordIds),
          mapPublicListingSummaryRow
        )
      );
    },

    async findRadiusPage(
      search: RadiusPublicListingSearch,
      boundingBox: RadiusBoundingBox,
      activeLandlordIds?: readonly number[]
    ): Promise<readonly PublicRadiusListingSummary[]> {
      return Object.freeze(
        await queryMany<PublicRadiusListingSummaryRow, PublicRadiusListingSummary>(
          executor,
          radiusPageQuery(search, boundingBox, activeLandlordIds),
          mapPublicRadiusListingSummaryRow
        )
      );
    }
  });
}
