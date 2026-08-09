import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  RepositoryInvariantError
} from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import {
  mapPublicListingSummaryRow,
  type PublicListingSummary,
  type PublicListingSummaryRow
} from "../listings/public-listing-summary-mapper.js";

export interface FavoritePageInput {
  readonly tenantId: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface EnsureFavoritePresentResult {
  readonly isVisible: boolean;
  readonly wasInserted: boolean;
}

export interface FavoriteRepository {
  readonly findPage: (input: FavoritePageInput) => Promise<readonly PublicListingSummary[]>;
  readonly ensurePresent: (tenantId: number, listingId: number) => Promise<EnsureFavoritePresentResult>;
  readonly ensureAbsent: (tenantId: number, listingId: number) => Promise<number>;
}

interface EnsureFavoritePresentRow extends QueryResultRow {
  readonly is_visible: unknown;
  readonly was_inserted: unknown;
}

function mapEnsureFavoritePresentRow(row: Readonly<EnsureFavoritePresentRow>): EnsureFavoritePresentResult {
  if (typeof row.is_visible !== "boolean" || typeof row.was_inserted !== "boolean") {
    throw new RepositoryInvariantError("Favorite ensure-present representation is invalid.");
  }
  return Object.freeze({ isVisible: row.is_visible, wasInserted: row.was_inserted });
}

export function createFavoriteRepository(executor: SqlExecutor): FavoriteRepository {
  return Object.freeze({
    async findPage(input: FavoritePageInput): Promise<readonly PublicListingSummary[]> {
      return Object.freeze(
        await queryMany<PublicListingSummaryRow, PublicListingSummary>(
          executor,
          {
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
                  pt.label AS property_type_label,
                  f.created_at AS favorite_created_at
                FROM favorites AS f
                JOIN listings AS l ON l.id = f.listing_id
                JOIN users AS landlord ON landlord.id = l.landlord_id
                JOIN property_types AS pt ON pt.id = l.property_type_id
                WHERE f.tenant_id = $1
                  AND l.status = 'APPROVED'
                  AND landlord.is_active = true
                ORDER BY f.created_at DESC, f.listing_id DESC
                LIMIT $2
                OFFSET $3
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
              ORDER BY pc.favorite_created_at DESC, pc.id DESC
            `,
            values: [input.tenantId, input.pageSize + 1, input.offset]
          },
          mapPublicListingSummaryRow
        )
      );
    },

    async ensurePresent(tenantId: number, listingId: number): Promise<EnsureFavoritePresentResult> {
      return queryExactlyOne<EnsureFavoritePresentRow, EnsureFavoritePresentResult>(
        executor,
        {
          text: `
            WITH visible_target AS MATERIALIZED (
              SELECT l.id
              FROM listings AS l
              JOIN users AS landlord ON landlord.id = l.landlord_id
              WHERE l.id = $2
                AND l.status = 'APPROVED'
                AND landlord.is_active = true
            ),
            inserted AS (
              INSERT INTO favorites (tenant_id, listing_id)
              SELECT $1, visible_target.id
              FROM visible_target
              ON CONFLICT (tenant_id, listing_id)
              DO NOTHING
              RETURNING listing_id
            )
            SELECT
              EXISTS (SELECT 1 FROM visible_target) AS is_visible,
              EXISTS (SELECT 1 FROM inserted) AS was_inserted
          `,
          values: [tenantId, listingId]
        },
        mapEnsureFavoritePresentRow
      );
    },

    async ensureAbsent(tenantId: number, listingId: number): Promise<number> {
      return executeCommand(executor, {
        text: `
          DELETE FROM favorites
          WHERE tenant_id = $1
            AND listing_id = $2
        `,
        values: [tenantId, listingId]
      });
    }
  });
}
