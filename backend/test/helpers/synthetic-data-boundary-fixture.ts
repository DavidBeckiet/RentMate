import type { QueryResultRow } from "pg";

export const syntheticFixedTimestamp = "2030-01-02T03:04:05.006Z";

export interface SyntheticDataBoundaryRow extends QueryResultRow {
  readonly listing_id: number;
  readonly monthly_rent: string;
  readonly created_at: string;
  readonly summary_text: string | null;
  readonly contact_phone: string | null;
  readonly owner_email: string;
  readonly password_hash: string;
  readonly cloudinary_public_id: string;
  readonly amenity_codes: readonly string[];
  readonly provider_metadata: Readonly<{
    provider: string;
    tags: readonly string[];
  }>;
  readonly optional_note?: string | null | undefined;
}

export type SyntheticDataBoundaryOverrides = Partial<SyntheticDataBoundaryRow>;

export function createSyntheticDataBoundaryRow(
  overrides: SyntheticDataBoundaryOverrides = {}
): SyntheticDataBoundaryRow {
  const defaultAmenities = ["WIFI", "FURNISHED"];
  const defaultProviderMetadata = {
    provider: "fake-provider.example.invalid",
    tags: ["fake-rm013", "synthetic-only"]
  };
  const amenities = Object.freeze([...(overrides.amenity_codes ?? defaultAmenities)]);
  const metadataOverrides = overrides.provider_metadata;
  const providerMetadata = Object.freeze({
    provider: metadataOverrides?.provider ?? defaultProviderMetadata.provider,
    tags: Object.freeze([...(metadataOverrides?.tags ?? defaultProviderMetadata.tags)])
  });
  const optionalNote = Object.hasOwn(overrides, "optional_note") ? { optional_note: overrides.optional_note } : {};

  return Object.freeze({
    listing_id: 13_013,
    monthly_rent: "1250000",
    created_at: syntheticFixedTimestamp,
    summary_text: null,
    contact_phone: "+84900000000",
    owner_email: "owner-rm013@example.invalid",
    password_hash: "fake-password-hash-for-rm013-tests",
    cloudinary_public_id: "fake-provider-id/rm013",
    ...overrides,
    amenity_codes: amenities,
    provider_metadata: providerMetadata,
    ...optionalNote
  });
}
