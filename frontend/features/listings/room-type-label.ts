import type { Amenity, PropertyType } from "../../types/api";
import type { IconName } from "../../components/ui/icon";

const roomTypeLabels: Readonly<Record<string, string>> = {
  APARTMENT: "Căn hộ",
  DORMITORY: "Ký túc xá",
  HOUSE: "Nhà nguyên căn",
  ROOM: "Phòng trọ",
  STUDIO: "Căn studio"
};

const amenityLabels: Readonly<Record<string, string>> = {
  AIR_CONDITIONING: "Điều hòa",
  WIFI: "Wi-Fi",
  FURNISHED: "Có nội thất",
  PRIVATE_BATHROOM: "Phòng tắm riêng",
  KITCHEN: "Khu bếp",
  REFRIGERATOR: "Tủ lạnh",
  WASHING_MACHINE: "Máy giặt",
  PARKING: "Chỗ để xe",
  ELEVATOR: "Thang máy",
  SECURITY: "An ninh",
  BALCONY: "Ban công",
  PET_FRIENDLY: "Cho phép thú cưng"
};

const amenityIcons: Readonly<Record<string, IconName>> = {
  AIR_CONDITIONING: "snowflake",
  WIFI: "wifi",
  FURNISHED: "home",
  PRIVATE_BATHROOM: "bath",
  KITCHEN: "utensils",
  REFRIGERATOR: "refrigerator",
  WASHING_MACHINE: "washingMachine",
  PARKING: "car",
  ELEVATOR: "building",
  SECURITY: "shield",
  BALCONY: "building",
  PET_FRIENDLY: "paw"
};

function normalizedCode(value: string): string {
  return value.trim().toUpperCase();
}

export function propertyTypeLabelForCode(code: string): string | null {
  return roomTypeLabels[normalizedCode(code)] ?? null;
}

export function amenityLabelForCode(code: string): string | null {
  return amenityLabels[normalizedCode(code)] ?? null;
}

function fallbackAmenityLabel(code: string, label: string): string {
  const normalizedLabel = label.trim();
  if (normalizedLabel && !/^[A-Z0-9_]+$/.test(normalizedLabel)) return normalizedLabel;
  if (!code) return "Tiện ích";
  return code
    .split("_")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.charAt(0) + part.slice(1).toLowerCase() : part.toLowerCase()))
    .join(" ");
}

export function propertyTypeLabel(propertyType: Pick<PropertyType, "code" | "label">): string {
  return propertyTypeLabelForCode(propertyType.code) ?? propertyType.label;
}

export function amenityLabel(amenity: Pick<Amenity, "code" | "label">): string {
  const code = normalizedCode(amenity.code);
  return amenityLabelForCode(code) ?? fallbackAmenityLabel(code, amenity.label);
}

export function amenityIcon(amenity: Pick<Amenity, "code" | "label">): IconName {
  return amenityIcons[normalizedCode(amenity.code)] ?? "home";
}
