import type { PropertyType } from "../../types/api";

const roomTypeLabels: Readonly<Record<string, string>> = {
  APARTMENT: "Căn hộ",
  DORMITORY: "Ký túc xá",
  HOUSE: "Nhà nguyên căn",
  ROOM: "Phòng trọ",
  STUDIO: "Căn studio"
};

export function propertyTypeLabel(propertyType: Pick<PropertyType, "code" | "label">): string {
  return roomTypeLabels[propertyType.code.trim().toUpperCase()] ?? propertyType.label;
}
