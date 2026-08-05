export interface ListingCompletenessCandidate {
  readonly propertyType: unknown;
  readonly title: unknown;
  readonly description: unknown;
  readonly monthlyRent: unknown;
  readonly roomAreaSqm: unknown;
  readonly addressText: unknown;
  readonly areaName: unknown;
  readonly latitude: unknown;
  readonly longitude: unknown;
}

export type ListingCompletenessField =
  | "propertyType"
  | "title"
  | "description"
  | "monthlyRent"
  | "roomAreaSqm"
  | "addressText"
  | "areaName"
  | "latitude"
  | "longitude";

const listingCompletenessFields = Object.freeze([
  "propertyType",
  "title",
  "description",
  "monthlyRent",
  "roomAreaSqm",
  "addressText",
  "areaName",
  "latitude",
  "longitude"
] as const satisfies readonly ListingCompletenessField[]);

export function findMissingListingCompletenessFields(
  candidate: Readonly<ListingCompletenessCandidate>
): readonly ListingCompletenessField[] {
  return Object.freeze(listingCompletenessFields.filter((field) => candidate[field] === null));
}
