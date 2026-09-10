import type { Amenity, PropertyType } from "../../types/api";
import { amenityLabelForCode, propertyTypeLabelForCode } from "../listings/room-type-label";
import { areaMatches, formatAreaLabel } from "../../lib/area";

export interface ComparisonListingData {
  readonly id: number;
  readonly title: string;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly maxOccupants: number | null;
  readonly areaName: string | null;
  readonly propertyType: PropertyType | null;
  readonly amenities: readonly Amenity[];
}

export interface ComparisonNeeds {
  readonly q?: string;
  readonly areaName?: string;
  readonly minMonthlyRent?: number;
  readonly maxMonthlyRent?: number;
  readonly minRoomAreaSqm?: number;
  readonly maxRoomAreaSqm?: number;
  readonly minOccupants?: number;
  readonly propertyType?: string;
  readonly amenities: readonly string[];
}

export type ComparisonCriterion = "area" | "budget" | "propertyType" | "roomArea" | "occupancy" | "amenities";

export type ComparisonEvaluationStatus = "MATCH" | "MISMATCH" | "UNKNOWN" | "NOT_APPLICABLE";

export interface ComparisonCriterionResult {
  readonly criterion: ComparisonCriterion;
  readonly status: ComparisonEvaluationStatus;
  readonly explanation: string;
}

const moneyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatMoney(value: number): string {
  return `${moneyFormatter.format(Math.max(0, Math.round(value)))} ₫`;
}

function formatArea(value: number): string {
  return `${numberFormatter.format(Math.abs(value))} m²`;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function result(
  criterion: ComparisonCriterion,
  status: ComparisonEvaluationStatus,
  explanation: string
): ComparisonCriterionResult {
  return { criterion, status, explanation };
}

function evaluateArea(listing: ComparisonListingData, needs: ComparisonNeeds): ComparisonCriterionResult | null {
  const requestedArea = needs.areaName?.trim() ?? "";
  if (!requestedArea) return null;
  const listingArea = listing.areaName?.trim() ?? "";
  if (!listingArea) return result("area", "UNKNOWN", "Khu vực của tin chưa được cập nhật.");
  return areaMatches(listingArea, requestedArea)
    ? result("area", "MATCH", "Đúng khu vực bạn chọn.")
    : result("area", "MISMATCH", "Khác khu vực mong muốn.");
}

function evaluateBudget(listing: ComparisonListingData, needs: ComparisonNeeds): ComparisonCriterionResult | null {
  const minimum = needs.minMonthlyRent;
  const maximum = needs.maxMonthlyRent;
  if (minimum === undefined && maximum === undefined) return null;
  if (listing.monthlyRent === null || !Number.isFinite(listing.monthlyRent)) {
    return result("budget", "UNKNOWN", "Giá thuê của tin chưa được cập nhật.");
  }

  if (minimum !== undefined && listing.monthlyRent < minimum) {
    return result("budget", "MISMATCH", `Thấp hơn mức tối thiểu ${formatMoney(minimum - listing.monthlyRent)}.`);
  }
  if (maximum !== undefined && listing.monthlyRent > maximum) {
    return result("budget", "MISMATCH", `Cao hơn ngân sách ${formatMoney(listing.monthlyRent - maximum)}.`);
  }
  if (minimum !== undefined && maximum !== undefined && minimum === maximum) {
    return result("budget", "MATCH", "Đúng mức giá bạn đặt.");
  }
  return result("budget", "MATCH", "Trong khoảng ngân sách bạn chọn.");
}

function evaluatePropertyType(
  listing: ComparisonListingData,
  needs: ComparisonNeeds
): ComparisonCriterionResult | null {
  const requestedCode = needs.propertyType?.trim().toUpperCase();
  if (!requestedCode) return null;
  if (!listing.propertyType) return result("propertyType", "UNKNOWN", "Loại phòng của tin chưa được cập nhật.");
  if (listing.propertyType.code.trim().toUpperCase() === requestedCode) {
    const label = propertyTypeLabelForCode(requestedCode) ?? listing.propertyType.label;
    return result("propertyType", "MATCH", `Đúng loại ${label}.`);
  }
  const requestedLabel = propertyTypeLabelForCode(requestedCode) ?? "loại phòng đã chọn";
  return result("propertyType", "MISMATCH", `Loại phòng khác ${requestedLabel}.`);
}

function evaluateRoomArea(listing: ComparisonListingData, needs: ComparisonNeeds): ComparisonCriterionResult | null {
  const minimum = needs.minRoomAreaSqm;
  const maximum = needs.maxRoomAreaSqm;
  if (minimum === undefined && maximum === undefined) return null;
  if (listing.roomAreaSqm === null || !Number.isFinite(listing.roomAreaSqm)) {
    return result("roomArea", "UNKNOWN", "Diện tích của tin chưa được cập nhật.");
  }
  if (minimum !== undefined && listing.roomAreaSqm < minimum) {
    return result("roomArea", "MISMATCH", `Nhỏ hơn mức mong muốn ${formatArea(minimum - listing.roomAreaSqm)}.`);
  }
  if (maximum !== undefined && listing.roomAreaSqm > maximum) {
    return result("roomArea", "MISMATCH", `Lớn hơn mức tối đa ${formatArea(listing.roomAreaSqm - maximum)}.`);
  }
  return result("roomArea", "MATCH", "Nằm trong khoảng diện tích bạn chọn.");
}

function evaluateOccupancy(listing: ComparisonListingData, needs: ComparisonNeeds): ComparisonCriterionResult | null {
  const minimum = needs.minOccupants;
  if (minimum === undefined) return null;
  if (listing.maxOccupants === null || !Number.isFinite(listing.maxOccupants)) {
    return result("occupancy", "UNKNOWN", "Sức chứa của tin chưa được cập nhật.");
  }
  return listing.maxOccupants >= minimum
    ? result("occupancy", "MATCH", `Đủ sức chứa từ ${minimum} người.`)
    : result("occupancy", "MISMATCH", `Sức chứa hiện tại là ${listing.maxOccupants} người.`);
}

function evaluateAmenities(listing: ComparisonListingData, needs: ComparisonNeeds): ComparisonCriterionResult | null {
  const requiredCodes = [...new Set(needs.amenities.map(normalizeCode).filter(Boolean))];
  if (requiredCodes.length === 0) return null;
  const unsupported = requiredCodes.filter((code) => amenityLabelForCode(code) === null);
  if (unsupported.length > 0) {
    return result("amenities", "UNKNOWN", "Một số tiện ích trong nhu cầu chưa được hỗ trợ để đối chiếu.");
  }
  const listingCodes = new Set(listing.amenities.map((item) => normalizeCode(item.code)));
  const missing = requiredCodes.filter((code) => !listingCodes.has(code));
  if (missing.length > 0) {
    const labels = missing.map((code) => amenityLabelForCode(code) ?? "Tiện ích");
    return result("amenities", "MISMATCH", `Thiếu: ${labels.join(" · ")}.`);
  }
  return result("amenities", "MATCH", "Có đủ tiện ích bạn chọn.");
}

export function evaluateComparisonNeeds(
  listing: ComparisonListingData,
  needs: ComparisonNeeds
): readonly ComparisonCriterionResult[] {
  return Object.freeze(
    [
      evaluateArea(listing, needs),
      evaluateBudget(listing, needs),
      evaluatePropertyType(listing, needs),
      evaluateRoomArea(listing, needs),
      evaluateOccupancy(listing, needs),
      evaluateAmenities(listing, needs)
    ].filter((item): item is ComparisonCriterionResult => item !== null)
  );
}

export function normalizeComparisonNeeds(input: Partial<ComparisonNeeds>): ComparisonNeeds {
  const numberValue = (value: number | undefined): number | undefined =>
    value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
  return Object.freeze({
    ...(input.q?.trim() ? { q: input.q.trim() } : {}),
    ...(input.areaName?.trim() ? { areaName: formatAreaLabel(input.areaName) } : {}),
    ...(numberValue(input.minMonthlyRent) === undefined ? {} : { minMonthlyRent: numberValue(input.minMonthlyRent) }),
    ...(numberValue(input.maxMonthlyRent) === undefined ? {} : { maxMonthlyRent: numberValue(input.maxMonthlyRent) }),
    ...(numberValue(input.minRoomAreaSqm) === undefined ? {} : { minRoomAreaSqm: numberValue(input.minRoomAreaSqm) }),
    ...(numberValue(input.maxRoomAreaSqm) === undefined ? {} : { maxRoomAreaSqm: numberValue(input.maxRoomAreaSqm) }),
    ...(numberValue(input.minOccupants) === undefined ? {} : { minOccupants: numberValue(input.minOccupants) }),
    ...(input.propertyType?.trim() ? { propertyType: normalizeCode(input.propertyType) } : {}),
    amenities: Object.freeze([...new Set((input.amenities ?? []).map(normalizeCode).filter(Boolean))])
  });
}
