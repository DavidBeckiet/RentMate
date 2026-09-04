const compactRentFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const distanceKmFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const radiusFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function formatNearMeRent(monthlyRent: number): string {
  if (!Number.isFinite(monthlyRent) || monthlyRent < 0) return "—";
  return `${compactRentFormatter.format(monthlyRent / 1_000_000)}tr`;
}

export function formatNearMePopupRent(monthlyRent: number): string {
  if (!Number.isFinite(monthlyRent) || monthlyRent < 0) return "—";
  return `${compactRentFormatter.format(monthlyRent / 1_000_000)} triệu/tháng`;
}

export function formatNearMeDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return "—";
  if (distanceKm < 0.5) return `${Math.round(distanceKm * 1_000)} m`;
  return `${distanceKmFormatter.format(distanceKm)} km`;
}

export function formatNearMeRadius(radiusKm: number): string {
  if (!Number.isFinite(radiusKm) || radiusKm < 0) return "—";
  return radiusFormatter.format(radiusKm);
}

export function formatNearMeResultSummary(count: number, radiusKm: number): string {
  const countLabel = new Intl.NumberFormat("vi-VN").format(Math.max(0, count));
  const radiusLabel = formatNearMeRadius(radiusKm);
  if (count === 0) return `Không tìm thấy phòng trong bán kính ${radiusLabel} km.`;
  return `Tìm thấy ${countLabel} phòng trong bán kính ${radiusLabel} km.`;
}
