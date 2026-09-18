import type {
  ActivationBody,
  AdminEngagementOverview,
  AdminIdentityOverview,
  AdminListingOverview,
  AdminUserDetail,
  AdminLandlordVerification,
  AdminContactReport,
  AdminContactReportQuery,
  AdminSupportRequest,
  AdminSupportRequestQuery,
  AdminListingReview,
  AdminReviewReport,
  AdminReviewReportQuery,
  AdminListingReport,
  AdminReportQuery,
  AdminListingDetail,
  AdminListingQuery,
  AdminListingSummary,
  AdminUserQuery,
  AdminReviewQuery,
  ApiPage,
  ModerateReviewBody,
  UpdateReviewReportStatusBody,
  ModerationBody,
  ModerationHistoryItem,
  PaginationQuery,
  ReviewVerificationBody,
  UpdateReportStatusBody,
  UpdateContactReportStatusBody,
  UpdateSupportRequestStatusBody,
  UserProfile,
  VerificationQuery
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createAdminApi(transport: ApiTransport) {
  return {
    getIdentityOverview: (signal?: AbortSignal): Promise<AdminIdentityOverview> =>
      transport.object("/api/v1/admin/overview/identity", { signal }),

    getListingOverview: (signal?: AbortSignal): Promise<AdminListingOverview> =>
      transport.object("/api/v1/admin/overview/listings", { signal }),

    getEngagementOverview: (signal?: AbortSignal): Promise<AdminEngagementOverview> =>
      transport.object("/api/v1/admin/overview/engagement", { signal }),

    listListings: (query: AdminListingQuery = {}, signal?: AbortSignal): Promise<ApiPage<AdminListingSummary>> =>
      transport.page("/api/v1/admin/listings", { query, signal }),

    getListing: (listingId: number, signal?: AbortSignal): Promise<AdminListingDetail> =>
      transport.object(`/api/v1/admin/listings/${listingId}`, { signal }),

    listHistory: (
      listingId: number,
      query: PaginationQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<ModerationHistoryItem>> =>
      transport.page(`/api/v1/admin/listings/${listingId}/moderation-actions`, { query, signal }),

    moderate: (listingId: number, body: ModerationBody, signal?: AbortSignal): Promise<ModerationHistoryItem> =>
      transport.object(`/api/v1/admin/listings/${listingId}/moderation-actions`, {
        method: "POST",
        json: body,
        signal
      }),

    listUsers: (query: AdminUserQuery = {}, signal?: AbortSignal): Promise<ApiPage<UserProfile>> =>
      transport.page("/api/v1/admin/users", { query, signal }),

    getUser: (userId: number, signal?: AbortSignal): Promise<AdminUserDetail> =>
      transport.object(`/api/v1/admin/users/${userId}`, { signal }),

    setActivation: (userId: number, body: ActivationBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object(`/api/v1/admin/users/${userId}/activation`, { method: "PATCH", json: body, signal }),

    listReports: (query: AdminReportQuery = {}, signal?: AbortSignal): Promise<ApiPage<AdminListingReport>> =>
      transport.page("/api/v1/admin/reports", { query, signal }),

    getReport: (reportId: number, signal?: AbortSignal): Promise<AdminListingReport> =>
      transport.object(`/api/v1/admin/reports/${reportId}`, { signal }),

    updateReportStatus: (
      reportId: number,
      body: UpdateReportStatusBody,
      signal?: AbortSignal
    ): Promise<AdminListingReport> =>
      transport.object(`/api/v1/admin/reports/${reportId}/status`, { method: "PATCH", json: body, signal }),

    listContactReports: (
      query: AdminContactReportQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<AdminContactReport>> => transport.page("/api/v1/admin/contact-reports", { query, signal }),

    getContactReport: (reportId: number, signal?: AbortSignal): Promise<AdminContactReport> =>
      transport.object(`/api/v1/admin/contact-reports/${reportId}`, { signal }),

    updateContactReportStatus: (
      reportId: number,
      body: UpdateContactReportStatusBody,
      signal?: AbortSignal
    ): Promise<AdminContactReport> =>
      transport.object(`/api/v1/admin/contact-reports/${reportId}/status`, { method: "PATCH", json: body, signal }),

    listSupportRequests: (
      query: AdminSupportRequestQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<AdminSupportRequest>> => transport.page("/api/v1/admin/support-requests", { query, signal }),

    getSupportRequest: (supportRequestId: number, signal?: AbortSignal): Promise<AdminSupportRequest> =>
      transport.object(`/api/v1/admin/support-requests/${supportRequestId}`, { signal }),

    updateSupportRequestStatus: (
      supportRequestId: number,
      body: UpdateSupportRequestStatusBody,
      signal?: AbortSignal
    ): Promise<AdminSupportRequest> =>
      transport.object(`/api/v1/admin/support-requests/${supportRequestId}/status`, {
        method: "PATCH",
        json: body,
        signal
      }),

    listVerifications: (
      query: VerificationQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<AdminLandlordVerification>> => transport.page("/api/v1/admin/verifications", { query, signal }),

    getVerification: (verificationId: number, signal?: AbortSignal): Promise<AdminLandlordVerification> =>
      transport.object(`/api/v1/admin/verifications/${verificationId}`, { signal }),

    reviewVerification: (
      verificationId: number,
      body: ReviewVerificationBody,
      signal?: AbortSignal
    ): Promise<AdminLandlordVerification> =>
      transport.object(`/api/v1/admin/verifications/${verificationId}/status`, {
        method: "PATCH",
        json: body,
        signal
      }),

    listReviews: (query: AdminReviewQuery = {}, signal?: AbortSignal): Promise<ApiPage<AdminListingReview>> =>
      transport.page("/api/v1/admin/reviews", { query, signal }),

    getReview: (reviewId: number, signal?: AbortSignal): Promise<AdminListingReview> =>
      transport.object(`/api/v1/admin/reviews/${reviewId}`, { signal }),

    moderateReview: (reviewId: number, body: ModerateReviewBody, signal?: AbortSignal): Promise<AdminListingReview> =>
      transport.object(`/api/v1/admin/reviews/${reviewId}/status`, { method: "PATCH", json: body, signal }),

    listReviewReports: (
      query: AdminReviewReportQuery = {},
      signal?: AbortSignal
    ): Promise<ApiPage<AdminReviewReport>> => transport.page("/api/v1/admin/review-reports", { query, signal }),

    getReviewReport: (reportId: number, signal?: AbortSignal): Promise<AdminReviewReport> =>
      transport.object(`/api/v1/admin/review-reports/${reportId}`, { signal }),

    updateReviewReportStatus: (
      reportId: number,
      body: UpdateReviewReportStatusBody,
      signal?: AbortSignal
    ): Promise<AdminReviewReport> =>
      transport.object(`/api/v1/admin/review-reports/${reportId}/status`, { method: "PATCH", json: body, signal })
  } as const;
}
