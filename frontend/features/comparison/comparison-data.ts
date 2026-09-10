import type { PublicImage, PublicListingDetail } from "../../types/api";
import type { ComparisonListingData } from "./comparison-needs-evaluator";

export interface ComparisonListing extends ComparisonListingData {
  readonly coverImage: PublicImage | null;
  readonly landlordVerified: boolean;
  readonly businessStatus: PublicListingDetail["businessStatus"];
  readonly updatedAt: string;
}

export function projectComparisonListing(detail: PublicListingDetail): ComparisonListing {
  const coverImage = [...detail.images].sort((left, right) => left.displayOrder - right.displayOrder)[0] ?? null;
  return Object.freeze({
    id: detail.id,
    title: detail.title,
    monthlyRent: detail.monthlyRent,
    roomAreaSqm: detail.roomAreaSqm,
    maxOccupants: detail.maxOccupants,
    areaName: detail.areaName,
    propertyType: detail.propertyType,
    amenities: detail.amenities,
    coverImage,
    landlordVerified: detail.landlordVerified,
    businessStatus: detail.businessStatus,
    updatedAt: detail.updatedAt
  });
}
