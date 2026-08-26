import type { ReactNode } from "react";

export const staleListingThresholdDays = 30;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export interface ListingFreshness {
  readonly daysSinceUpdate: number | null;
  readonly isStale: boolean;
  readonly label: string;
}

export function getListingFreshness(updatedAt: string, now: Date = new Date()): ListingFreshness {
  const updatedTimestamp = new Date(updatedAt).getTime();
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(updatedTimestamp) || !Number.isFinite(nowTimestamp)) {
    return Object.freeze({ daysSinceUpdate: null, isStale: true, label: "Chưa xác định thời điểm cập nhật" });
  }

  const daysSinceUpdate = Math.max(0, Math.floor((nowTimestamp - updatedTimestamp) / millisecondsPerDay));
  if (daysSinceUpdate === 0) {
    return Object.freeze({ daysSinceUpdate, isStale: false, label: "Cập nhật hôm nay" });
  }
  if (daysSinceUpdate === 1) {
    return Object.freeze({ daysSinceUpdate, isStale: false, label: "Cập nhật 1 ngày trước" });
  }
  if (daysSinceUpdate >= staleListingThresholdDays) {
    return Object.freeze({
      daysSinceUpdate,
      isStale: true,
      label: `Cập nhật ${daysSinceUpdate} ngày trước — có thể đã cũ`
    });
  }
  return Object.freeze({ daysSinceUpdate, isStale: false, label: `Cập nhật ${daysSinceUpdate} ngày trước` });
}

export function ListingFreshnessLabel({
  updatedAt,
  className = ""
}: {
  readonly updatedAt: string;
  readonly className?: string;
}): ReactNode {
  const freshness = getListingFreshness(updatedAt);
  return (
    <span
      className={`${freshness.isStale ? "font-semibold text-amber-800" : "text-rent-subtle"} ${className}`}
      title={`Cập nhật lúc ${new Date(updatedAt).toLocaleString("vi-VN")}`}
    >
      {freshness.label}
    </span>
  );
}
