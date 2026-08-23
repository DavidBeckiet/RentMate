import type {
  CreateInquiryBody,
  Inquiry,
  InquiryMessage,
  Notification,
  PaginationQuery,
  ApiPage,
  InquiryStatus
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createContactApi(transport: ApiTransport) {
  return {
    createInquiry: (body: CreateInquiryBody, signal?: AbortSignal): Promise<Inquiry> =>
      transport.object("/api/v1/inquiries", { method: "POST", json: body, signal }),
    listTenantInquiries: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<Inquiry>> =>
      transport.page("/api/v1/tenant/inquiries", { query, signal }),
    listLandlordInquiries: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<Inquiry>> =>
      transport.page("/api/v1/landlord/inquiries", { query, signal }),
    getInquiry: (inquiryId: number, signal?: AbortSignal): Promise<Inquiry> =>
      transport.object(`/api/v1/inquiries/${inquiryId}`, { signal }),
    sendMessage: (inquiryId: number, body: string, signal?: AbortSignal): Promise<InquiryMessage> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/messages`, { method: "POST", json: { body }, signal }),
    updateInquiryStatus: (inquiryId: number, status: InquiryStatus, signal?: AbortSignal): Promise<Inquiry> =>
      transport.object(`/api/v1/inquiries/${inquiryId}/status`, { method: "PATCH", json: { status }, signal }),
    listNotifications: (query: PaginationQuery = {}, signal?: AbortSignal): Promise<ApiPage<Notification>> =>
      transport.page("/api/v1/notifications", { query, signal }),
    markNotificationRead: (notificationId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH", signal }),
    markAllNotificationsRead: (signal?: AbortSignal): Promise<void> =>
      transport.void("/api/v1/notifications/read-all", { method: "POST", signal })
  } as const;
}
