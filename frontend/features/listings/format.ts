const vndFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const areaFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const distanceFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function formatVnd(value: number): string {
  return `${vndFormatter.format(value)} ₫/tháng`;
}

export function formatAreaSqm(value: number): string {
  return `${areaFormatter.format(value)} m²`;
}

export function formatDistanceKm(value: number): string {
  return `${distanceFormatter.format(value)} km`;
}
