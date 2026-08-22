import { validateCreateListingDraftInput, type CreateListingDraftInput } from "./listing-create-validation.js";

export type ListingUpdateField<Value> =
  | Readonly<{ readonly provided: false }>
  | Readonly<{ readonly provided: true; readonly value: Value }>;

export interface ListingUpdateInput {
  readonly title: ListingUpdateField<string | null>;
  readonly description: ListingUpdateField<string | null>;
  readonly monthlyRent: ListingUpdateField<number | null>;
  readonly propertyTypeCode: ListingUpdateField<string | null>;
  readonly roomAreaSqm: ListingUpdateField<number | null>;
  readonly addressText: ListingUpdateField<string | null>;
  readonly areaName: ListingUpdateField<string | null>;
  readonly coordinates: ListingUpdateField<Readonly<{ latitude: number | null; longitude: number | null }>>;
  readonly amenityCodes: ListingUpdateField<readonly string[]>;
}

const absent = Object.freeze({ provided: false as const });

function field<Value>(
  body: Record<string, unknown>,
  name: keyof CreateListingDraftInput,
  value: Value
): ListingUpdateField<Value> {
  return Object.prototype.hasOwnProperty.call(body, name) ? Object.freeze({ provided: true, value }) : absent;
}

export function validateListingUpdateInput(value: unknown): ListingUpdateInput {
  const normalized = validateCreateListingDraftInput(value);
  const body = value as Record<string, unknown>;
  const hasLatitude = Object.prototype.hasOwnProperty.call(body, "latitude");
  const hasLongitude = Object.prototype.hasOwnProperty.call(body, "longitude");

  return Object.freeze({
    title: field(body, "title", normalized.title),
    description: field(body, "description", normalized.description),
    monthlyRent: field(body, "monthlyRent", normalized.monthlyRent),
    propertyTypeCode: field(body, "propertyTypeCode", normalized.propertyTypeCode),
    roomAreaSqm: field(body, "roomAreaSqm", normalized.roomAreaSqm),
    addressText: field(body, "addressText", normalized.addressText),
    areaName: field(body, "areaName", normalized.areaName),
    coordinates:
      hasLatitude || hasLongitude
        ? Object.freeze({
            provided: true,
            value: Object.freeze({ latitude: normalized.latitude, longitude: normalized.longitude })
          })
        : absent,
    amenityCodes: field(body, "amenityCodes", normalized.amenityCodes)
  });
}
