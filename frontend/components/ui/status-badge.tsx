import type { ListingStatus } from "../../types/api";

const listingStatusPresentation: Record<ListingStatus, { label: string; classes: string; dot: string }> = {
  DRAFT: {
    label: "Nháp",
    classes: "bg-[#dfddd5] text-heroDark-950",
    dot: "bg-slate-400"
  },
  PENDING: {
    label: "Chờ duyệt",
    classes: "bg-rent-yellow text-heroDark-950",
    dot: "bg-amber-600"
  },
  APPROVED: {
    label: "Đã duyệt",
    classes: "bg-rent-accent text-heroDark-950",
    dot: "bg-brandBlue-600"
  },
  REJECTED: {
    label: "Bị từ chối",
    classes: "bg-rent-coral text-heroDark-950",
    dot: "bg-rose-500"
  },
  HIDDEN: {
    label: "Đã ẩn",
    classes: "bg-[#cbd5e1] text-heroDark-950",
    dot: "bg-slate-400"
  },
  INACTIVE: {
    label: "Ngừng hoạt động",
    classes: "bg-[#cbd5e1] text-heroDark-950",
    dot: "bg-slate-400"
  }
};

function Badge({ label, classes, dot, context }: { label: string; classes: string; dot: string; context: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border-2 border-heroDark-950 px-3 py-1 font-display text-xs font-bold leading-none shadow-glass-sm ${classes}`}
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
      classes="bg-rent-accent text-heroDark-950"
      dot="bg-brandBlue-600"
      context="Trạng thái tài khoản"
    />
  ) : (
    <Badge
      label="Ngừng hoạt động"
      classes="bg-[#cbd5e1] text-heroDark-950"
      dot="bg-slate-400"
      context="Trạng thái tài khoản"
    />
  );
}
