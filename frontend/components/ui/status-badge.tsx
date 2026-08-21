import type { ListingStatus } from "../../types/api";

const listingStatusPresentation: Record<ListingStatus, { label: string; classes: string; dot: string }> = {
  DRAFT: {
    label: "Nháp",
    classes: "border-slate-300 bg-slate-100/80 text-slate-700",
    dot: "bg-slate-400"
  },
  PENDING: {
    label: "Chờ duyệt",
    classes: "border-amber-300/80 bg-amber-50 text-amber-900 shadow-sm",
    dot: "bg-amber-500 animate-pulse"
  },
  APPROVED: {
    label: "Đã duyệt",
    classes: "border-sky-300/80 bg-sky-50 text-sky-800 shadow-sm",
    dot: "bg-sky-500 shadow-sm"
  },
  REJECTED: {
    label: "Bị từ chối",
    classes: "border-rose-300/80 bg-rose-50 text-rose-900",
    dot: "bg-rose-500"
  },
  HIDDEN: {
    label: "Đã ẩn",
    classes: "border-slate-300 bg-slate-100 text-slate-600",
    dot: "bg-slate-400"
  },
  INACTIVE: {
    label: "Ngừng hoạt động",
    classes: "border-slate-300 bg-slate-100 text-slate-600",
    dot: "bg-slate-400"
  }
};

function Badge({
  label,
  classes,
  dot,
  context
}: {
  label: string;
  classes: string;
  dot: string;
  context: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold leading-none tracking-tight transition-all ${classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
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
    <Badge
      label="Đang hoạt động"
      classes="border-sky-300/80 bg-sky-50 text-sky-800 shadow-sm"
      dot="bg-sky-500 shadow-sm"
      context="Trạng thái tài khoản"
    />
  ) : (
    <Badge
      label="Ngừng hoạt động"
      classes="border-slate-300 bg-slate-100 text-slate-600"
      dot="bg-slate-400"
      context="Trạng thái tài khoản"
    />
  );
}
