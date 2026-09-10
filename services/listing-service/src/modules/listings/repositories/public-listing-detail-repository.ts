import { queryMany, queryOptional } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import {
  mapPublicListingSummaryRow,
  type PublicListingSummary,
  type PublicListingSummaryRow
} from "../../../../../shared/public-listing-summary.js";
import {
  mapBasePublicListingDetailResult,
  mapTenantPublicListingDetailResult,
  type MappedPublicListingDetailResult,
  type PublicListingDetailRow,
  type TenantPublicListingDetailRow
} from "../mappers/public-listing-detail-mapper.js";

export interface PublicListingDetailRepository {
  readonly findPublicDetailById: (
    listingId: number,
    includeContact: boolean,
    reporterId?: number
  ) => Promise<MappedPublicListingDetailResult | null>;
  readonly findSimilarPublicListings: (listingId: number, limit: number) => Promise<readonly PublicListingSummary[]>;
}

export interface PublicListingDetailLandlordProfile {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
  readonly isActive: boolean;
}

export interface PublicListingDetailRepositoryDependencies {
  readonly loadActiveLandlordIds?: () => Promise<readonly number[]>;
  readonly loadLandlordProfiles?: (
    userIds: readonly number[]
  ) => Promise<readonly PublicListingDetailLandlordProfile[]>;
  readonly loadVerifiedLandlordIds?: (userIds: readonly number[]) => Promise<readonly number[]>;
}

const publicProjection = `
        l.id,
        l.business_status,
        l.title,
        l.description,
        l.monthly_rent,
        l.room_area_sqm,
        l.max_occupants,
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
        AND l.business_status IN ('AVAILABLE', 'UNKNOWN')
        AND landlord.is_active = true
      LIMIT 1
    `;

const reportProjection = (reporterId: number | undefined): string =>
  reporterId === undefined
    ? "false AS has_reported"
    : "EXISTS (SELECT 1 FROM listing_reports AS report WHERE report.listing_id = l.id AND report.reporter_id = $2) AS has_reported";

const basePublicDetailQuery = (listingId: number, reporterId?: number): ParameterizedQuery => ({
  text: `
      SELECT${publicProjection}, ${reportProjection(reporterId)}
      ${publicFrom}
  `,
  values: reporterId === undefined ? [listingId] : [listingId, reporterId]
});

const tenantPublicDetailQuery = (listingId: number, reporterId?: number): ParameterizedQuery => ({
  text: `
      SELECT${publicProjection}, ${reportProjection(reporterId)},
        landlord.email AS landlord_email,
        landlord.phone_e164 AS landlord_phone
      ${publicFrom}
  `,
  values: reporterId === undefined ? [listingId] : [listingId, reporterId]
});

const similarPublicListingsQuery = (
  listingId: number,
  limit: number,
  activeLandlordIds: readonly number[] | undefined
): ParameterizedQuery => {
  const localLandlordJoins =
    activeLandlordIds === undefined
      ? `
      JOIN users AS current_landlord
        ON current_landlord.id = current_listing.landlord_id
      JOIN users AS landlord
        ON landlord.id = l.landlord_id`
      : "";
  const landlordVisibility =
    activeLandlordIds === undefined
      ? "current_landlord.is_active = true AND landlord.is_active = true"
      : "current_listing.landlord_id = ANY($3::integer[]) AND l.landlord_id = ANY($3::integer[])";

  return {
    text: `
      SELECT
        l.id,
        l.landlord_id,
        l.business_status,
        l.title,
        l.monthly_rent,
        l.room_area_sqm,
        l.max_occupants,
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
      JOIN listings AS current_listing
        ON current_listing.id = $1
      ${localLandlordJoins}
      JOIN property_types AS pt
        ON pt.id = l.property_type_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('code', a.code, 'label', a.label)
          ORDER BY a.label ASC, a.code ASC
        ) AS items
        FROM listing_amenities AS la
        JOIN amenities AS a ON a.id = la.amenity_id
        WHERE la.listing_id = l.id
      ) AS amenity_data ON true
      LEFT JOIN LATERAL (
        SELECT secure_url, alt_text, display_order
        FROM listing_images
        WHERE listing_id = l.id
        ORDER BY display_order ASC, id ASC
        LIMIT 1
      ) AS cover ON true
      WHERE current_listing.status = 'APPROVED'
        AND current_listing.business_status IN ('AVAILABLE', 'UNKNOWN')
        AND ${landlordVisibility}
        AND l.id <> current_listing.id
        AND l.status = 'APPROVED'
        AND l.business_status IN ('AVAILABLE', 'UNKNOWN')
        AND l.area_name = current_listing.area_name
      ORDER BY
        (l.property_type_id = current_listing.property_type_id) DESC,
        ABS(l.monthly_rent - current_listing.monthly_rent) ASC,
        ABS(l.room_area_sqm - current_listing.room_area_sqm) ASC,
        l.updated_at DESC,
        l.id DESC
      LIMIT $2
    `,
    values: activeLandlordIds === undefined ? [listingId, limit] : [listingId, limit, [...activeLandlordIds]]
  };
};

const remotePublicDetailQuery = (listingId: number, reporterId?: number): ParameterizedQuery => ({
  text: `
      SELECT
        l.landlord_id,
        ${publicProjection}, ${reportProjection(reporterId)}
      FROM listings AS l
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
        AND l.business_status IN ('AVAILABLE', 'UNKNOWN')
      LIMIT 1
    `,
  values: reporterId === undefined ? [listingId] : [listingId, reporterId]
});

export function createPublicListingDetailRepository(
  executor: SqlExecutor,
  dependencies: PublicListingDetailRepositoryDependencies = {}
): PublicListingDetailRepository {
  const repository: PublicListingDetailRepository = {
    async findPublicDetailById(
      listingId: number,
      includeContact: boolean,
      reporterId?: number
    ): Promise<MappedPublicListingDetailResult | null> {
      if (dependencies.loadLandlordProfiles) {
        const row = await queryOptional<PublicListingDetailRow, PublicListingDetailRow>(
          executor,
          remotePublicDetailQuery(listingId, reporterId),
          (value) => value
        );
        if (row === null || !Number.isSafeInteger(row.landlord_id) || (row.landlord_id as number) < 1) return null;
        const landlordId = row.landlord_id as number;

        const [profiles, verifiedLandlordIds] = await Promise.all([
          dependencies.loadLandlordProfiles([landlordId]),
          dependencies.loadVerifiedLandlordIds?.([landlordId]) ?? Promise.resolve(Object.freeze([]))
        ]);
        const landlord = profiles.find((profile) => profile.id === landlordId);
        if (landlord === undefined || !landlord.isActive || landlord.role !== "LANDLORD") return null;

        const mapped = mapBasePublicListingDetailResult(row);
        const detail = Object.freeze({
          ...mapped.detail,
          landlordVerified: verifiedLandlordIds.includes(landlordId)
        });
        return Object.freeze({
          detail,
          landlordContact:
            includeContact && landlord.phone !== null
              ? Object.freeze({ email: landlord.email, phone: landlord.phone })
              : null
        });
      }

      if (includeContact) {
        return queryOptional<TenantPublicListingDetailRow, MappedPublicListingDetailResult>(
          executor,
          tenantPublicDetailQuery(listingId, reporterId),
          mapTenantPublicListingDetailResult
        );
      }

      return queryOptional<PublicListingDetailRow, MappedPublicListingDetailResult>(
        executor,
        basePublicDetailQuery(listingId, reporterId),
        mapBasePublicListingDetailResult
      );
    },

    async findSimilarPublicListings(listingId, limit) {
      const activeLandlordIds = dependencies.loadActiveLandlordIds
        ? await dependencies.loadActiveLandlordIds()
        : undefined;
      const rows = await queryMany<PublicListingSummaryRow, PublicListingSummaryRow>(
        executor,
        similarPublicListingsQuery(listingId, limit, activeLandlordIds),
        (value) => value
      );
      if (rows.length === 0) return Object.freeze([]);

      const mapped = rows.map((row) => ({
        landlordId: row.landlord_id,
        summary: mapPublicListingSummaryRow(row)
      }));
      const landlordIds = mapped
        .map((item) => item.landlordId)
        .filter((value): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0);
      const verifiedIds = dependencies.loadVerifiedLandlordIds
        ? await dependencies.loadVerifiedLandlordIds([...new Set(landlordIds)])
        : Object.freeze([]);
      return Object.freeze(
        mapped.map(({ landlordId, summary }) =>
          typeof landlordId === "number" && verifiedIds.includes(landlordId)
            ? Object.freeze({ ...summary, landlordVerified: true })
            : summary
        )
      );
    }
  };
  return Object.freeze(repository);
}
