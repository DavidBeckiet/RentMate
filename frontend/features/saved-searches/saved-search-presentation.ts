import type { SavedSearch, SavedSearchQuery } from "../../types/api";
import { amenityLabelForCode, propertyTypeLabelForCode } from "../listings/room-type-label";
import { formatAreaLabel } from "../../lib/area";

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatMillions(value: number): string {
  return `${formatNumber(value / 1_000_000)} triệu`;
}

export function formatSavedSearchBudget(
  query: Pick<SavedSearchQuery, "minMonthlyRent" | "maxMonthlyRent">
): string | null {
  const minimum = query.minMonthlyRent;
  const maximum = query.maxMonthlyRent;
  if (minimum === null && maximum === null) return null;
  if (minimum === null) return `Dưới ${formatMillions(maximum!)}/tháng`;
  if (maximum === null) return `Từ ${formatMillions(minimum)}/tháng`;
  if (minimum === maximum) return `${formatMillions(minimum)}/tháng`;
  return `${formatMillions(minimum)}–${formatMillions(maximum)}/tháng`;
}

export function formatSavedSearchArea(
  query: Pick<SavedSearchQuery, "minRoomAreaSqm" | "maxRoomAreaSqm">
): string | null {
  const minimum = query.minRoomAreaSqm;
  const maximum = query.maxRoomAreaSqm;
  if (minimum === null && maximum === null) return null;
  if (minimum === null) return `Dưới ${formatNumber(maximum!)} m²`;
  if (maximum === null) return `Từ ${formatNumber(minimum)} m²`;
  if (minimum === maximum) return `${formatNumber(minimum)} m²`;
  return `${formatNumber(minimum)}–${formatNumber(maximum)} m²`;
}

function formatGeo(query: SavedSearchQuery): string | null {
  if (query.mode === "radius" && query.radiusKm !== null) {
    return `Bán kính ${formatNumber(query.radiusKm)} km quanh khu vực đã chọn`;
  }
  if (query.mode === "bounds") return "Vùng bản đồ đã chọn";
  return null;
}

function formatSort(sort: SavedSearchQuery["sort"]): string | null {
  if (sort === "newest") return null;
  if (sort === "rent_asc") return "Giá thấp đến cao";
  if (sort === "rent_desc") return "Giá cao đến thấp";
  if (sort === "distance_asc") return "Gần nhất";
  return null;
}

function formatAmenities(codes: readonly string[]): string | null {
  const labels = codes.map(amenityLabelForCode).filter((label): label is string => label !== null);
  if (labels.length === 0) return null;
  const visible = labels.slice(0, 3).join(" · ");
  const remaining = labels.length - 3;
  return remaining > 0 ? `${visible} +${remaining}` : visible;
}

export function savedSearchCriteria(query: SavedSearchQuery): readonly string[] {
  const criteria: string[] = [];
  if (query.areaName) criteria.push(formatAreaLabel(query.areaName));

  const geo = formatGeo(query);
  if (geo) criteria.push(geo);

  const budget = formatSavedSearchBudget(query);
  if (budget) criteria.push(budget);

  const propertyType = query.propertyType ? propertyTypeLabelForCode(query.propertyType) : null;
  if (propertyType) criteria.push(propertyType);

  const area = formatSavedSearchArea(query);
  if (area) criteria.push(area);

  if (query.minOccupants !== null) criteria.push(`Từ ${query.minOccupants} người`);

  const amenities = formatAmenities(query.amenities);
  if (amenities) criteria.push(amenities);

  if (query.q) criteria.push(`Từ khóa: ${query.q}`);

  const sort = formatSort(query.sort);
  if (sort) criteria.push(sort);

  return criteria.length > 0 ? Object.freeze(criteria) : Object.freeze(["Tất cả tin đăng mới nhất"]);
}

export function generateSavedSearchName(query: SavedSearchQuery): string {
  const area = query.areaName ? formatAreaLabel(query.areaName) : null;
  const propertyType = query.propertyType ? propertyTypeLabelForCode(query.propertyType) : null;
  const budget = formatSavedSearchBudget(query);

  if (propertyType && area) return `${propertyType} ${area}`;
  if (area && budget) return `${area} · ${budget.replace("/tháng", "")}`;
  if (propertyType && budget) return `${propertyType} ${budget.replace("/tháng", "")}`;
  if (area) return area;
  if (propertyType) return propertyType;
  if (budget) return budget.replace("/tháng", "");
  return "Tìm kiếm đã lưu";
}

export function savedSearchTitle(item: Pick<SavedSearch, "name" | "query">): string {
  const customName = item.name?.trim();
  return customName || generateSavedSearchName(item.query);
}
