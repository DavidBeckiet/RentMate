import type { PublicImage, PublicListingDetail, PublicListingSummary, PropertyType } from "../../types/api";

export interface RoommateListingOption {
  readonly id: number;
  readonly businessStatus: PublicListingSummary["businessStatus"];
  readonly title: string;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly maxOccupants: number | null;
  readonly areaName: string;
  readonly propertyType: PropertyType;
  readonly coverImage: PublicImage | null;
  readonly updatedAt: string;
}

export function roommateListingFromSummary(listing: PublicListingSummary): RoommateListingOption {
  return {
    id: listing.id,
    businessStatus: listing.businessStatus,
    title: listing.title,
    monthlyRent: listing.monthlyRent,
    roomAreaSqm: listing.roomAreaSqm,
    maxOccupants: listing.maxOccupants,
    areaName: listing.areaName,
    propertyType: listing.propertyType,
    coverImage: listing.coverImage,
    updatedAt: listing.updatedAt
  };
}

export function roommateListingFromDetail(listing: PublicListingDetail): RoommateListingOption {
  const coverImage = [...listing.images].sort((left, right) => left.displayOrder - right.displayOrder)[0] ?? null;
  return {
    id: listing.id,
    businessStatus: listing.businessStatus,
    title: listing.title,
    monthlyRent: listing.monthlyRent,
    roomAreaSqm: listing.roomAreaSqm,
    maxOccupants: listing.maxOccupants,
    areaName: listing.areaName,
    propertyType: listing.propertyType,
    coverImage,
    updatedAt: listing.updatedAt
  };
}

export function isRoommateListingEligible(
  listing: Pick<RoommateListingOption, "maxOccupants" | "businessStatus">
): boolean {
  return (
    listing.maxOccupants !== null &&
    listing.maxOccupants >= 2 &&
    (listing.businessStatus === "AVAILABLE" || listing.businessStatus === "UNKNOWN")
  );
}
