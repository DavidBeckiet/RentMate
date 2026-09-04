import type { Amenity, PropertyType } from "../../types/api";

const roomTypeLabels: Readonly<Record<string, string>> = {
  APARTMENT: "Căn hộ",
  DORMITORY: "Ký túc xá",
  HOUSE: "Nhà nguyên căn",
  ROOM: "Phòng trọ",
  STUDIO: "Căn studio"
};

const amenityLabels: Readonly<Record<string, string>> = {
  AIR_CONDITIONING: "Máy lạnh",
  WIFI: "Wi-Fi"
};

export function propertyTypeLabel(propertyType: Pick<PropertyType, "code" | "label">): string {
  return roomTypeLabels[propertyType.code.trim().toUpperCase()] ?? propertyType.label;
}

export function amenityLabel(amenity: Pick<Amenity, "code" | "label">): string {
  return amenityLabels[amenity.code.trim().toUpperCase()] ?? amenity.label;
}
