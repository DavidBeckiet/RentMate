import type {
  AdminRoommateReport,
  AdminRoommateReportQuery,
  ApiPage,
  CreateRoommateReportBody,
  CreateRoommateRequestBody,
  CreateRoommateRequestReportBody,
  RoommateBlockState,
  RoommateConnection,
  RoommateDiscoveryQuery,
  RoommateInterest,
  RoommateInterestQuery,
  RoommateMessage,
  RoommateMineQuery,
  RoommateModerationBody,
  RoommateModerationResult,
  RoommateProfile,
  RoommateProfileBody,
  RoommateReportReceipt,
  RoommateRequest,
  UpdateRoommateReportStatusBody,
  UpdateRoommateRequestBody
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createRoommateApi(transport: ApiTransport) {
  return {
    getProfile: (signal?: AbortSignal): Promise<RoommateProfile> =>
      transport.object("/api/v1/roommate-profiles/me", { signal }),

    upsertProfile: (body: RoommateProfileBody, signal?: AbortSignal): Promise<RoommateProfile> =>
      transport.object("/api/v1/roommate-profiles/me", { method: "PUT", json: body, signal }),

    createRequest: (body: CreateRoommateRequestBody, signal?: AbortSignal): Promise<RoommateRequest> =>
      transport.object("/api/v1/roommate-requests", { method: "POST", json: body, signal }),

    discover: (query: RoommateDiscoveryQuery = {}, signal?: AbortSignal): Promise<ApiPage<RoommateRequest>> =>
      transport.page("/api/v1/roommate-requests", { query, signal }),

    listMine: (query: RoommateMineQuery = {}, signal?: AbortSignal): Promise<ApiPage<RoommateRequest>> =>
      transport.page("/api/v1/roommate-requests/mine", { query, signal }),

    getRequest: (requestId: number, signal?: AbortSignal): Promise<RoommateRequest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}`, { signal }),

    updateRequest: (
      requestId: number,
      body: UpdateRoommateRequestBody,
      signal?: AbortSignal
    ): Promise<RoommateRequest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}`, { method: "PATCH", json: body, signal }),

    cancelRequest: (requestId: number, signal?: AbortSignal): Promise<RoommateRequest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/cancel`, { method: "POST", signal }),

    renewRequest: (requestId: number, signal?: AbortSignal): Promise<RoommateRequest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/renew`, { method: "POST", signal }),

    linkListing: (requestId: number, listingId: number, signal?: AbortSignal): Promise<RoommateRequest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/listing`, {
        method: "PUT",
        json: { listingId },
        signal
      }),

    unlinkListing: (requestId: number, signal?: AbortSignal): Promise<RoommateRequest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/listing`, { method: "DELETE", signal }),

    createInterest: (requestId: number, message: string, signal?: AbortSignal): Promise<RoommateInterest> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/interests`, {
        method: "POST",
        json: { message },
        signal
      }),

    listIncoming: (
      requestId: number,
      query: { readonly page?: number; readonly pageSize?: number } = {},
      signal?: AbortSignal
    ) => transport.page<RoommateInterest>(`/api/v1/roommate-requests/${requestId}/interests`, { query, signal }),

    listInterests: (query: RoommateInterestQuery, signal?: AbortSignal): Promise<ApiPage<RoommateInterest>> =>
      transport.page("/api/v1/roommate-interests", { query, signal }),

    getInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateInterest> =>
      transport.object(`/api/v1/roommate-interests/${interestId}`, { signal }),

    acceptInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateInterest> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/accept`, { method: "POST", signal }),

    rejectInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateInterest> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/reject`, { method: "POST", signal }),

    withdrawInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateInterest> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/withdraw`, { method: "POST", signal }),

    leaveInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateInterest> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/leave`, { method: "POST", signal }),

    getCurrentConnection: (signal?: AbortSignal): Promise<RoommateConnection> =>
      transport.object("/api/v1/roommate-connections/current", { signal }),

    listMessages: (
      interestId: number,
      query: { readonly page?: number; readonly pageSize?: number } = {},
      signal?: AbortSignal
    ): Promise<ApiPage<RoommateMessage>> =>
      transport.page(`/api/v1/roommate-interests/${interestId}/messages`, { query, signal }),

    sendMessage: (interestId: number, body: string, signal?: AbortSignal): Promise<RoommateMessage> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/messages`, {
        method: "POST",
        json: { body },
        signal
      }),

    markMessagesRead: (interestId: number, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/roommate-interests/${interestId}/read`, { method: "POST", signal }),

    blockRequest: (requestId: number, signal?: AbortSignal): Promise<RoommateBlockState> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/block`, { method: "PUT", signal }),

    unblockRequest: (requestId: number, signal?: AbortSignal): Promise<RoommateBlockState> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/block`, { method: "DELETE", signal }),

    blockInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateBlockState> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/block`, { method: "PUT", signal }),

    unblockInterest: (interestId: number, signal?: AbortSignal): Promise<RoommateBlockState> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/block`, { method: "DELETE", signal }),

    reportRequest: (
      requestId: number,
      body: CreateRoommateRequestReportBody,
      signal?: AbortSignal
    ): Promise<RoommateReportReceipt> =>
      transport.object(`/api/v1/roommate-requests/${requestId}/reports`, { method: "POST", json: body, signal }),

    reportInterest: (
      interestId: number,
      body: CreateRoommateReportBody,
      signal?: AbortSignal
    ): Promise<RoommateReportReceipt> =>
      transport.object(`/api/v1/roommate-interests/${interestId}/reports`, { method: "POST", json: body, signal }),

    reportMessage: (
      messageId: number,
      body: CreateRoommateReportBody,
      signal?: AbortSignal
    ): Promise<RoommateReportReceipt> =>
      transport.object(`/api/v1/roommate-messages/${messageId}/reports`, { method: "POST", json: body, signal }),

    listAdminReports: (
      query: AdminRoommateReportQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<AdminRoommateReport>> =>
      transport.page("/api/v1/admin/contact-reports", { query: { source: "ROOMMATE", ...query }, signal }),

    getAdminReport: (reportId: number, signal?: AbortSignal): Promise<AdminRoommateReport> =>
      transport.object(`/api/v1/admin/contact-reports/${reportId}`, { signal }),

    updateAdminReportStatus: (
      reportId: number,
      body: UpdateRoommateReportStatusBody,
      signal?: AbortSignal
    ): Promise<AdminRoommateReport> =>
      transport.object(`/api/v1/admin/contact-reports/${reportId}/status`, { method: "PATCH", json: body, signal }),

    moderateProfile: (
      tenantId: number,
      body: RoommateModerationBody,
      signal?: AbortSignal
    ): Promise<RoommateModerationResult> =>
      transport.object(`/api/v1/admin/roommate-profiles/${tenantId}/moderation`, {
        method: "PATCH",
        json: body,
        signal
      }),

    moderateRequest: (
      requestId: number,
      body: RoommateModerationBody,
      signal?: AbortSignal
    ): Promise<RoommateModerationResult> =>
      transport.object(`/api/v1/admin/roommate-requests/${requestId}/moderation`, {
        method: "PATCH",
        json: body,
        signal
      }),

    moderateMessage: (
      messageId: number,
      body: RoommateModerationBody,
      signal?: AbortSignal
    ): Promise<RoommateModerationResult> =>
      transport.object(`/api/v1/admin/roommate-messages/${messageId}/moderation`, {
        method: "PATCH",
        json: body,
        signal
      })
  } as const;
}
