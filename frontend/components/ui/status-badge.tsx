import type { ListingStatus } from "../../types/api";

const listingStatusPresentation: Record<ListingStatus, { label: string; classes: string }> = {
  DRAFT: { label: "Nháp", classes: "border-stone-300 bg-stone-100 text-slate-800" },
  PENDING: { label: "Chờ duyệt", classes: "border-amber-300 bg-amber-50 text-amber-900" },
  APPROVED: { label: "Đã duyệt", classes: "border-teal-300 bg-teal-50 text-teal-900" },
  REJECTED: { label: "Bị từ chối", classes: "border-red-300 bg-red-50 text-red-900" },
  HIDDEN: { label: "Đã ẩn", classes: "border-red-300 bg-red-50 text-red-900" },
  INACTIVE: { label: "Ngừng hoạt động", classes: "border-stone-300 bg-stone-100 text-slate-800" }
};

function Badge({ label, classes, context }: { label: string; classes: string; context: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      <span className="sr-only">{context}: </span>
      {label}
    </span>
  );
}

export function ListingStatusBadge({ status }: { readonly status: ListingStatus }) {
  const presentation = listingStatusPresentation[status];
  return <Badge {...presentation} context="Trạng thái tin đăng" />;
}

export function AccountStatusBadge({ isActive }: { readonly isActive: boolean }) {
  return isActive ? (
    <Badge label="Đang hoạt động" classes="border-teal-300 bg-teal-50 text-teal-900" context="Trạng thái tài khoản" />
  ) : (
    <Badge
      label="Ngừng hoạt động"
      classes="border-stone-300 bg-stone-100 text-slate-800"
      context="Trạng thái tài khoản"
    />
  );
}
