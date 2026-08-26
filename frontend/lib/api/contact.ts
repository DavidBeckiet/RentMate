import type {
  ApiPage,
  CreateInquiryBody,
  CreateContactReportBody,
  CreateSupportRequestBody,
  ContactBlockState,
  ContactReportReceipt,
  CreateReviewBody,
  Inquiry,
  InquiryMessage,
  InquiryStatus,
  ListingReview,
  Notification,
  NotificationUnreadCount,
  PaginationQuery,
  ReviewEligibility,
  SupportRequestReceipt
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createContactApi(transport: ApiTransport) {
  return {
    createInquiry: (body: CreateInquiryBody, signal?: AbortSignal): Promise<Inquiry> =>
      transport.object("/api/v1/inquiries", { method: "POST", json: body, signal }),
    createSupportRequest: (body: CreateSupportRequestBody, signal?: AbortSignal): Promise<SupportRequestReceipt> =>
      transport.object("/api/v1/support-requests", { method: "POST", json: body, signal }),
    listTenantInquiries: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<Inquiry>> =>
      transport.page("/api/v1/tenant/inquiries", { query, signal }),
    listLandlordInquiries: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<Inquiry>> =>
      transport.page("/api/v1/landlord/inquiries", { query, signal }),
    getInquiry: (inquiryId: number, signal?: AbortSignal): Promise<Inquiry> =>
      transport.object(`/api/v1/inquiries/${inquiryId}`, { signal }),
    sendMessage: (inquiryId: number, body: string, signal?: AbortSignal): Promise<InquiryMessage> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/messages`, { method: "POST", json: { body }, signal }),
    blockInquiry: (inquiryId: number, signal?: AbortSignal): Promise<ContactBlockState> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/block`, { method: "POST", json: {}, signal }),
    unblockInquiry: (inquiryId: number, signal?: AbortSignal): Promise<ContactBlockState> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/block`, { method: "DELETE", signal }),
    createContactReport: (
      inquiryId: number,
      body: CreateContactReportBody,
      signal?: AbortSignal
    ): Promise<ContactReportReceipt> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/reports`, { method: "POST", json: body, signal }),
    updateInquiryStatus: (inquiryId: number, status: InquiryStatus, signal?: AbortSignal): Promise<Inquiry> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/status`, { method: "PATCH", json: { status }, signal }),
    listNotifications: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<Notification>> =>
      transport.page("/api/v1/notifications", { query, signal }),
    getUnreadNotificationCount: (signal?: AbortSignal): Promise<NotificationUnreadCount> =>
      transport.object("/api/v1/notifications/unread-count", { signal }),
    markNotificationRead: (notificationId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH", signal }),
    markAllNotificationsRead: (signal?: AbortSignal): Promise<void> =>
      transport.void("/api/v1/notifications/read-all", { method: "POST", signal }),
    getReviewEligibility: (inquiryId: number, signal?: AbortSignal): Promise<ReviewEligibility> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/review`, { signal }),
    createReview: (inquiryId: number, body: CreateReviewBody, signal?: AbortSignal): Promise<ListingReview> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/review`, { method: "POST", json: body, signal })
  } as const;
}
