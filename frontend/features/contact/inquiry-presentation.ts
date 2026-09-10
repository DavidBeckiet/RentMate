import type { BadgeVariant } from "../../components/ui/badge";
import type { InquiryMessage, InquiryStatus, UserRole } from "../../types/api";

type ConversationViewerRole = Extract<UserRole, "TENANT" | "LANDLORD">;

export function getInquiryStatusLabel(status: InquiryStatus, viewerRole: ConversationViewerRole = "TENANT"): string {
  if (status === "CONTACTED") return "Đang trao đổi";
  if (status === "CLOSED") return "Đã đóng";
  return viewerRole === "LANDLORD" ? "Chờ phản hồi" : "Đã gửi";
}

export function getInquirySenderLabel(
  senderRole: InquiryMessage["senderRole"],
  viewerRole: ConversationViewerRole
): string {
  if (senderRole === viewerRole) return "Bạn";
  return senderRole === "LANDLORD" ? "Chủ trọ" : "Người thuê";
}

export function getInquiryStatusVariant(status: InquiryStatus): BadgeVariant {
  return status === "NEW" ? "info" : status === "CONTACTED" ? "primary" : "neutral";
}
