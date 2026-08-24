import type { ListingStatus } from "../../types/api";
import { Badge, type BadgeVariant } from "./badge";

const listingStatusPresentation: Record<ListingStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: {
    label: "Nháp",
    variant: "neutral"
  },
  PENDING: {
    label: "Chờ duyệt",
    variant: "warning"
  },
  APPROVED: {
    label: "Đã duyệt",
    variant: "success"
  },
  REJECTED: {
    label: "Bị từ chối",
    variant: "danger"
  },
  HIDDEN: {
    label: "Đã ẩn",
    variant: "neutral"
  },
  INACTIVE: {
    label: "Ngừng hoạt động",
    variant: "neutral"
  }
};

function StatusBadge({ label, variant, context }: { label: string; variant: BadgeVariant; context: string }) {
  return (
    <Badge variant={variant} context={context} showIndicator>
      {label}
    </Badge>
  );
}

export function ListingStatusBadge({ status }: { readonly status: ListingStatus }) {
  const presentation = listingStatusPresentation[status];
  return <StatusBadge {...presentation} context="Trạng thái tin đăng" />;
}

export function AccountStatusBadge({ isActive }: { readonly isActive: boolean }) {
  return isActive ? (
    <StatusBadge label="Đang hoạt động" variant="success" context="Trạng thái tài khoản" />
  ) : (
    <StatusBadge label="Ngừng hoạt động" variant="neutral" context="Trạng thái tài khoản" />
  );
}
