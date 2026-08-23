export interface PublicInquiryTarget {
  readonly listingId: number;
  readonly landlordId: number;
}

function isPublicInquiryTarget(value: unknown): value is PublicInquiryTarget {
  if (typeof value !== "object" || value === null) return false;
  const target = value as Partial<PublicInquiryTarget>;
  return (
    Number.isSafeInteger(target.listingId) &&
    (target.listingId ?? 0) > 0 &&
    Number.isSafeInteger(target.landlordId) &&
    (target.landlordId ?? 0) > 0
  );
}

export function assertPublicInquiryTarget(value: unknown): PublicInquiryTarget {
  if (!isPublicInquiryTarget(value)) throw new Error("Public inquiry target representation is invalid.");
  return Object.freeze({ listingId: value.listingId, landlordId: value.landlordId });
}
