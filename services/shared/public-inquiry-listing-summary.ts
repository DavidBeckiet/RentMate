import type { PublicListingSummary } from "./public-listing-summary.js";

/**
 * The intentionally narrow listing projection used beside an Inquiry.
 * Keep coordinates, contact details, moderation data, and owner-only fields out.
 */
export interface PublicInquiryListingSummary {
  readonly id: number;
  readonly title: string;
  readonly propertyType: Readonly<Pick<PublicListingSummary["propertyType"], "code" | "label">>;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly areaName: string;
  readonly businessStatus: PublicListingSummary["businessStatus"];
  readonly coverImage: Readonly<Pick<PublicListingSummary["coverImage"], "url" | "altText" | "displayOrder">> | null;
}

export function mapPublicInquiryListingSummary(summary: PublicListingSummary): PublicInquiryListingSummary {
  return Object.freeze({
    id: summary.id,
    title: summary.title,
    propertyType: Object.freeze({ code: summary.propertyType.code, label: summary.propertyType.label }),
    monthlyRent: summary.monthlyRent,
    roomAreaSqm: summary.roomAreaSqm,
    areaName: summary.areaName,
    businessStatus: summary.businessStatus,
    coverImage: summary.coverImage
      ? Object.freeze({
          url: summary.coverImage.url,
          altText: summary.coverImage.altText,
          displayOrder: summary.coverImage.displayOrder
        })
      : null
  });
}
