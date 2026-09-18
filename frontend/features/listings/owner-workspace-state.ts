import type { OwnerListingDetail, OwnerListingSummary } from "../../types/api";

export type OwnerWorkspaceMode = "EMPTY" | "GETTING_LISTING_LIVE" | "OPERATING" | "UNKNOWN";

export interface DraftRequirement {
  readonly key: string;
  readonly label: string;
  readonly complete: boolean;
}

export function resolveOwnerWorkspaceMode(currentListingCount: number, metadata: unknown): OwnerWorkspaceMode {
  if (currentListingCount === 0) return "EMPTY";
  if (typeof metadata !== "object" || metadata === null || !("hasEverApprovedListing" in metadata)) {
    return "UNKNOWN";
  }

  const hasEverApprovedListing = metadata.hasEverApprovedListing;
  if (typeof hasEverApprovedListing !== "boolean") return "UNKNOWN";
  return hasEverApprovedListing ? "OPERATING" : "GETTING_LISTING_LIVE";
}

export function selectProgressListing(listings: readonly OwnerListingSummary[]): OwnerListingSummary | null {
  return (
    listings.find((listing) => listing.status === "REJECTED") ??
    listings.find((listing) => listing.status === "DRAFT") ??
    listings.find((listing) => listing.status === "PENDING") ??
    listings[0] ??
    null
  );
}

export function getDraftRequirements(detail: OwnerListingDetail): readonly DraftRequirement[] {
  return [
    { key: "propertyType", label: "Loại phòng", complete: detail.propertyType !== null },
    { key: "title", label: "Tiêu đề", complete: detail.title !== null },
    { key: "description", label: "Mô tả", complete: detail.description !== null },
    { key: "monthlyRent", label: "Giá thuê", complete: detail.monthlyRent !== null },
    { key: "roomAreaSqm", label: "Diện tích", complete: detail.roomAreaSqm !== null },
    { key: "addressText", label: "Địa chỉ", complete: detail.addressText !== null },
    { key: "areaName", label: "Khu vực", complete: detail.areaName !== null },
    {
      key: "coordinates",
      label: "Vị trí bản đồ",
      complete: detail.latitude !== null && detail.longitude !== null
    },
    { key: "images", label: "Ảnh căn phòng", complete: detail.images.length > 0 }
  ];
}
