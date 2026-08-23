import type {
  ActivationBody,
  AdminLandlordVerification,
  AdminListingReview,
  AdminListingReport,
  AdminReportQuery,
  AdminListingDetail,
  AdminListingQuery,
  AdminListingSummary,
  AdminUserQuery,
  AdminReviewQuery,
  ApiPage,
  ModerateReviewBody,
  ModerationBody,
  ModerationHistoryItem,
  PaginationQuery,
  ReviewVerificationBody,
  UpdateReportStatusBody,
  UserProfile,
  VerificationQuery
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createAdminApi(transport: ApiTransport) {
  return {
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
      transport.object(`/api/v1/admin/reviews/${reviewId}/status`, { method: "PATCH", json: body, signal })
  } as const;
}
