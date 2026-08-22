import type { QueryResultRow } from "pg";
import { queryMany } from "../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import {
  mapPublicListingSummaryRow,
  type PublicListingSummary,
  type PublicListingSummaryRow
} from "../../shared/public-listing-summary.js";

export interface PublicListingCatalogRepository {
  readonly findPublicSummariesByIds: (
    listingIds: readonly number[],
    activeLandlordIds?: readonly number[]
  ) => Promise<readonly PublicListingSummary[]>;
}

interface CatalogRow extends PublicListingSummaryRow, QueryResultRow {}

export function createPublicListingCatalogRepository(executor: SqlExecutor): PublicListingCatalogRepository {
  return Object.freeze({
    async findPublicSummariesByIds(
      listingIds: readonly number[],
      activeLandlordIds?: readonly number[]
    ): Promise<readonly PublicListingSummary[]> {
      if (listingIds.length === 0 || activeLandlordIds?.length === 0) return Object.freeze([]);

      const values: unknown[] = [[...listingIds]];
      const visibility =
        activeLandlordIds === undefined
          ? "landlord.is_active = true"
          : `l.landlord_id = ANY($${values.push([...activeLandlordIds])}::integer[])`;

      return Object.freeze(
        await queryMany<CatalogRow, PublicListingSummary>(
          executor,
          {
            text: `
              SELECT
                l.id,
                l.title,
                l.monthly_rent,
                l.room_area_sqm,
                l.area_name,
                l.latitude,
                l.longitude,
                pt.code AS property_type_code,
                pt.label AS property_type_label,
                COALESCE(amenity_data.items, '[]'::jsonb) AS amenities,
                cover.secure_url AS cover_image_url,
                cover.alt_text AS cover_image_alt_text,
                cover.display_order AS cover_image_display_order,
                l.updated_at
              FROM listings AS l
              ${activeLandlordIds === undefined ? "JOIN users AS landlord ON landlord.id = l.landlord_id" : ""}
              JOIN property_types AS pt ON pt.id = l.property_type_id
              LEFT JOIN LATERAL (
                SELECT secure_url, alt_text, display_order
                FROM listing_images
                WHERE listing_id = l.id
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
                WHERE la.listing_id = l.id
              ) AS amenity_data ON true
              WHERE l.id = ANY($1::integer[])
                AND l.status = 'APPROVED'
                AND ${visibility}
              ORDER BY l.id ASC
            `,
            values
          },
          mapPublicListingSummaryRow
        )
      );
    }
  });
}
