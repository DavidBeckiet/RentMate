import { queryOptional } from "../../db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../../db/sql-executor.js";
import {
  mapBasePublicListingDetailResult,
  mapTenantPublicListingDetailResult,
  type MappedPublicListingDetailResult,
  type PublicListingDetailRow,
  type TenantPublicListingDetailRow
} from "./public-listing-detail-mapper.js";

export interface PublicListingDetailRepository {
  readonly findPublicDetailById: (
    listingId: number,
    includeContact: boolean
  ) => Promise<MappedPublicListingDetailResult | null>;
}

const publicProjection = `
        l.id,
        l.title,
        l.description,
        l.monthly_rent,
        l.room_area_sqm,
        l.area_name,
        l.latitude,
        l.longitude,
        pt.code AS property_type_code,
        pt.label AS property_type_label,
        COALESCE(amenity_data.items, '[]'::jsonb) AS amenities,
        COALESCE(image_data.items, '[]'::jsonb) AS images,
        l.updated_at`;

const publicFrom = `
      FROM listings AS l
      JOIN users AS landlord
        ON landlord.id = l.landlord_id
      JOIN property_types AS pt
        ON pt.id = l.property_type_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('code', a.code, 'label', a.label)
          ORDER BY a.label ASC, a.code ASC
        ) AS items
        FROM listing_amenities AS la
        JOIN amenities AS a
          ON a.id = la.amenity_id
        WHERE la.listing_id = l.id
      ) AS amenity_data
        ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'url', li.secure_url,
            'altText', li.alt_text,
            'displayOrder', li.display_order
          )
          ORDER BY li.display_order ASC, li.id ASC
        ) AS items
        FROM listing_images AS li
        WHERE li.listing_id = l.id
      ) AS image_data
        ON true
      WHERE l.id = $1
        AND l.status = 'APPROVED'
        AND landlord.is_active = true
      LIMIT 1
    `;

const basePublicDetailQuery = (listingId: number): ParameterizedQuery => ({
  text: `
      SELECT${publicProjection}
      ${publicFrom}
  `,
  values: [listingId]
});

const tenantPublicDetailQuery = (listingId: number): ParameterizedQuery => ({
  text: `
      SELECT${publicProjection},
        landlord.email AS landlord_email,
        landlord.phone_e164 AS landlord_phone
      ${publicFrom}
  `,
  values: [listingId]
});

export function createPublicListingDetailRepository(executor: SqlExecutor): PublicListingDetailRepository {
  return Object.freeze({
    async findPublicDetailById(
      listingId: number,
      includeContact: boolean
    ): Promise<MappedPublicListingDetailResult | null> {
      if (includeContact) {
        return queryOptional<TenantPublicListingDetailRow, MappedPublicListingDetailResult>(
          executor,
          tenantPublicDetailQuery(listingId),
          mapTenantPublicListingDetailResult
        );
      }

      return queryOptional<PublicListingDetailRow, MappedPublicListingDetailResult>(
        executor,
        basePublicDetailQuery(listingId),
        mapBasePublicListingDetailResult
      );
    }
  });
}
