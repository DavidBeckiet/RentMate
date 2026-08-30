export type UserRole = "TENANT" | "LANDLORD" | "ADMIN";

export type ListingStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";
export type ListingBusinessStatus = "AVAILABLE" | "PAUSED" | "RENTED" | "UNKNOWN";
export type ListingAvailabilityStatus = "NOT_APPLICABLE" | "CURRENT" | "REMINDER_DUE" | "AUTO_PAUSED";
export type InquiryStatus = "NEW" | "CONTACTED" | "CLOSED";
export type NotificationEventType =
  | "INQUIRY_CREATED"
  | "MESSAGE_CREATED"
  | "INQUIRY_STATUS_CHANGED"
  | "LEAD_REMINDER_DUE"
  | "LISTING_APPROVED"
  | "LISTING_REJECTED"
  | "LISTING_HIDDEN"
  | "SAVED_SEARCH_MATCHED"
  | "LISTING_AVAILABILITY_REMINDER"
  | "ROOMMATE_INTEREST_RECEIVED"
  | "ROOMMATE_INTEREST_ACCEPTED"
  | "ROOMMATE_INTEREST_REJECTED"
  | "ROOMMATE_INTEREST_WITHDRAWN"
  | "ROOMMATE_MESSAGE_RECEIVED"
  | "ROOMMATE_CONNECTION_LEFT"
  | "ROOMMATE_REQUEST_EXPIRING"
  | "ROOMMATE_REQUEST_EXPIRED";

export type ModerationAction = "APPROVE" | "REJECT" | "HIDE" | "RESTORE";

export interface UserProfile {
  readonly id: number;
  readonly role: UserRole;
  readonly displayName: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PropertyType {
  readonly code: string;
  readonly label: string;
}

export interface Amenity {
  readonly code: string;
  readonly label: string;
}

export interface PublicImage {
  readonly url: string;
  readonly altText: string | null;
  readonly displayOrder: number;
}

export interface OwnerImage extends PublicImage {
  readonly id: number;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly createdAt: string;
}

export interface PublicListingSummary {
  readonly id: number;
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly maxOccupants: number | null;
  readonly areaName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly propertyType: PropertyType;
  readonly amenities: readonly Amenity[];
  readonly coverImage: PublicImage;
  readonly distanceKm?: number;
  readonly landlordVerified?: boolean;
  readonly updatedAt: string;
}

export interface LandlordContact {
  readonly email: string;
  readonly phone: string;
}

export interface PublicListingDetail extends Omit<PublicListingSummary, "coverImage"> {
  readonly description: string;
  readonly images: readonly PublicImage[];
  readonly landlordVerified: boolean;
  readonly landlordContact?: LandlordContact;
}

export interface OwnerListingSummary {
  readonly id: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string | null;
  readonly monthlyRent: number | null;
  readonly maxOccupants: number | null;
  readonly areaName: string | null;
  readonly availabilityStatus: ListingAvailabilityStatus;
  readonly availabilityConfirmedAt: string | null;
  readonly availabilityExpiresAt: string | null;
  readonly propertyType: PropertyType | null;
  readonly coverImage: OwnerImage | null;
  readonly currentModerationReason: string | null;
  readonly updatedAt: string;
}

export interface OwnerListingDetail {
  readonly id: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly maxOccupants: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly availabilityStatus: ListingAvailabilityStatus;
  readonly availabilityConfirmedAt: string | null;
  readonly availabilityExpiresAt: string | null;
  readonly propertyType: PropertyType | null;
  readonly amenities: readonly Amenity[];
  readonly images: readonly OwnerImage[];
  readonly currentModerationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminListingLandlord {
  readonly id: number;
  readonly role?: "LANDLORD";
  readonly email: string;
  readonly phone: string;
  readonly isActive: boolean;
}

export interface AdminListingSummary {
  readonly id: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string | null;
  readonly areaName: string | null;
  readonly landlord: AdminListingLandlord;
  readonly openReportCount: number;
  readonly possibleDuplicate: boolean;
  readonly updatedAt: string;
}

export interface AdminListingDetail extends OwnerListingDetail {
  readonly landlord: AdminListingLandlord & { readonly role: "LANDLORD" };
}

export interface ModerationHistoryItem {
  readonly id: number;
  readonly listingId: number;
  readonly adminId: number;
  readonly previousStatus: ListingStatus;
  readonly newStatus: ListingStatus;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface GeocodingCandidate {
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface ApiPage<T> {
  readonly data: readonly T[];
  readonly pagination: Pagination;
}

export interface ApiErrorDetail {
  readonly field: string;
  readonly code: string;
  readonly message?: string;
}

export interface TenantRegistrationBody {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly phone?: string | null;
}

export interface LandlordRegistrationBody {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string;
}

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

export interface GoogleAuthStartBody {
  readonly intent: "LOGIN" | "REGISTER";
  readonly role?: "TENANT" | "LANDLORD";
  readonly phone?: string;
}

export interface GoogleAuthStartResponse {
  readonly redirectUrl: string;
}

export interface GoogleLandlordCompletionBody {
  readonly phone: string;
}

export interface PasswordResetRequestBody {
  readonly email: string;
}

export interface PasswordResetConfirmationBody {
  readonly token: string;
  readonly password: string;
}

export interface PasswordResetRequestReceipt {
  readonly accepted: true;
}

export interface UpdateCurrentUserBody {
  readonly displayName?: string;
  readonly phone?: string | null;
}

export interface PaginationQuery {
  readonly page?: number;
  readonly pageSize?: number;
}

export type PublicListingSort = "newest" | "rent_asc" | "rent_desc" | "distance_asc";

export interface PublicListingSearchQuery extends PaginationQuery {
  readonly q?: string;
  readonly areaName?: string;
  readonly minMonthlyRent?: number;
  readonly maxMonthlyRent?: number;
  readonly minRoomAreaSqm?: number;
  readonly maxRoomAreaSqm?: number;
  readonly minOccupants?: number;
  readonly propertyType?: string;
  readonly amenities?: readonly string[];
  readonly north?: number;
  readonly south?: number;
  readonly east?: number;
  readonly west?: number;
  readonly centerLat?: number;
  readonly centerLng?: number;
  readonly radiusKm?: number;
  readonly sort?: PublicListingSort;
}

export interface ListingContentBody {
  readonly title?: string | null;
  readonly description?: string | null;
  readonly monthlyRent?: number | null;
  readonly propertyTypeCode?: string | null;
  readonly roomAreaSqm?: number | null;
  readonly maxOccupants?: number | null;
  readonly addressText?: string | null;
  readonly areaName?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly amenityCodes?: readonly string[];
}

export interface ListingBusinessStatusBody {
  readonly businessStatus: ListingBusinessStatus;
}

export interface OwnedListingQuery extends PaginationQuery {
  readonly status?: ListingStatus;
  readonly businessStatus?: ListingBusinessStatus;
}

export interface UploadImageInput {
  readonly image: Blob;
  readonly altText?: string;
}

export interface ReorderImagesBody {
  readonly imageIds: readonly number[];
}

export interface ForwardGeocodeBody {
  readonly addressText: string;
}

export interface AdminListingQuery extends PaginationQuery {
  readonly status?: ListingStatus;
}

export interface ModerationBody {
  readonly action: ModerationAction;
  readonly reason?: string | null;
}

export interface AdminUserQuery extends PaginationQuery {
  readonly role?: UserRole;
  readonly isActive?: boolean;
}

export interface ActivationBody {
  readonly isActive: boolean;
}

export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface LandlordVerification {
  readonly id: number;
  readonly displayName: string;
  readonly requestNote: string | null;
  readonly status: VerificationStatus;
  readonly decisionNote: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
}

export interface ContactVerificationStatus {
  readonly email: {
    readonly address: string;
    readonly verified: boolean;
    readonly verifiedAt: string | null;
    readonly available?: boolean;
  };
  readonly phone: {
    readonly number: string | null;
    readonly verified: boolean;
    readonly verifiedAt: string | null;
    readonly available?: boolean;
  };
  readonly profile: LandlordVerification | null;
}

export interface TenantContactVerificationStatus {
  readonly email: {
    readonly address: string;
    readonly verified: boolean;
    readonly verifiedAt: string | null;
    readonly available: boolean;
  };
  readonly phone: {
    readonly number: string | null;
    readonly verified: boolean;
    readonly verifiedAt: string | null;
    readonly available: boolean;
  };
}

export interface AdminLandlordVerification extends LandlordVerification {
  readonly landlord: {
    readonly id: number;
    readonly email: string;
    readonly phone: string | null;
    readonly isActive: boolean;
  };
  readonly reviewedByAdminId: number | null;
  readonly updatedAt: string;
}

export interface CreateVerificationBody {
  readonly displayName: string;
  readonly note?: string | null;
}

export interface VerificationQuery extends PaginationQuery {
  readonly status?: VerificationStatus;
}

export interface ReviewVerificationBody {
  readonly status: Exclude<VerificationStatus, "PENDING">;
  readonly note: string;
}

export interface InquiryMessage {
  readonly id: number;
  readonly senderRole: "TENANT" | "LANDLORD";
  readonly body: string;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface Inquiry {
  readonly id: number;
  readonly listingId: number;
  readonly status: InquiryStatus;
  readonly contactPhone: string | null;
  readonly preferredContactAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canSendMessage: boolean;
  readonly blockedByCurrentUser: boolean;
  readonly messages: readonly InquiryMessage[];
}

export interface CreateInquiryBody {
  readonly listingId: number;
  readonly message: string;
  readonly contactPhone?: string | null;
  readonly preferredContactAt?: string | null;
}

export interface Notification {
  readonly id: number;
  readonly eventType: NotificationEventType;
  readonly inquiryId: number | null;
  readonly listingId: number | null;
  readonly roommateRequestId: number | null;
  readonly roommateInterestId: number | null;
  readonly resourcePath: string;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface NotificationUnreadCount {
  readonly unreadCount: number;
}

export type SavedSearchMode = "ordinary" | "bounds" | "radius";

export interface SavedSearchQuery {
  readonly q: string | null;
  readonly areaName: string | null;
  readonly minMonthlyRent: number | null;
  readonly maxMonthlyRent: number | null;
  readonly minRoomAreaSqm: number | null;
  readonly maxRoomAreaSqm: number | null;
  readonly minOccupants: number | null;
  readonly propertyType: string | null;
  readonly amenities: readonly string[];
  readonly mode: SavedSearchMode;
  readonly north: number | null;
  readonly south: number | null;
  readonly east: number | null;
  readonly west: number | null;
  readonly centerLat: number | null;
  readonly centerLng: number | null;
  readonly radiusKm: number | null;
  readonly sort: PublicListingSort;
}

export interface SavedSearch {
  readonly id: number;
  readonly name: string | null;
  readonly isActive: boolean;
  readonly query: SavedSearchQuery;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListingNote {
  readonly listingId: number;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSavedSearchBody {
  readonly name?: string | null;
  readonly isActive?: boolean;
  readonly query: SavedSearchQuery;
}

export interface UpdateSavedSearchBody {
  readonly name?: string | null;
  readonly isActive?: boolean;
  readonly query?: SavedSearchQuery;
}

export type ReportCategory =
  | "PRICE_INCORRECT"
  | "LOCATION_INCORRECT"
  | "IMAGE_INCORRECT"
  | "ALREADY_RENTED"
  | "FRAUD"
  | "INAPPROPRIATE";

export type ReportStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";

export interface CreateListingReportBody {
  readonly category: ReportCategory;
  readonly details?: string | null;
}

export interface ListingReportReceipt {
  readonly id: number;
  readonly listingId: number;
  readonly category: ReportCategory;
  readonly status: "OPEN";
  readonly createdAt: string;
}

export interface AdminReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "ADMIN";
  readonly previousStatus: ReportStatus | null;
  readonly newStatus: ReportStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface AdminListingReport {
  readonly id: number;
  readonly listing: {
    readonly id: number;
    readonly title: string | null;
    readonly areaName: string | null;
    readonly status: ListingStatus;
  };
  readonly reporter: { readonly id: number; readonly email: string; readonly isActive: boolean };
  readonly category: ReportCategory;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly events?: readonly AdminReportEvent[];
}

export type ContactReportCategory = "SPAM" | "FRAUD" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";
export type ContactReportStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";

export interface ContactBlockState {
  readonly canSendMessage: boolean;
  readonly blockedByCurrentUser: boolean;
}

export interface CreateContactReportBody {
  readonly category: ContactReportCategory;
  readonly details?: string | null;
  readonly messageId?: number | null;
}

export interface ContactReportReceipt {
  readonly id: number;
  readonly inquiryId: number;
  readonly category: ContactReportCategory;
  readonly status: "OPEN";
  readonly createdAt: string;
}

export interface AdminContactReportMessage {
  readonly id: number;
  readonly senderRole: "TENANT" | "LANDLORD";
  readonly body: string;
  readonly createdAt: string;
}

export interface AdminContactReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
  readonly previousStatus: ContactReportStatus | null;
  readonly newStatus: ContactReportStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface AdminContactReport {
  readonly id: number;
  readonly inquiryId: number;
  readonly listingId: number;
  readonly reporter: { readonly id: number; readonly email: string; readonly isActive: boolean };
  readonly message: AdminContactReportMessage | null;
  readonly category: ContactReportCategory;
  readonly details: string | null;
  readonly status: ContactReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly events?: readonly AdminContactReportEvent[];
}

export interface AdminContactReportQuery extends PaginationQuery {
  readonly status?: ContactReportStatus;
  readonly category?: ContactReportCategory;
}

export interface UpdateContactReportStatusBody {
  readonly status: Exclude<ContactReportStatus, "OPEN">;
  readonly note?: string | null;
}

export type SupportRequestCategory = "ACCOUNT" | "LISTING" | "SAFETY" | "TECHNICAL" | "OTHER";
export type SupportRequestStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export interface CreateSupportRequestBody {
  readonly category: SupportRequestCategory;
  readonly subject: string;
  readonly message: string;
}

export interface SupportRequestReceipt {
  readonly id: number;
  readonly status: "OPEN";
  readonly createdAt: string;
}

export interface AdminSupportRequest {
  readonly id: number;
  readonly requester: {
    readonly id: number;
    readonly role: UserRole;
    readonly email: string;
    readonly isActive: boolean;
  };
  readonly category: SupportRequestCategory;
  readonly subject: string;
  readonly message: string;
  readonly status: SupportRequestStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export interface AdminSupportRequestQuery extends PaginationQuery {
  readonly status?: SupportRequestStatus;
}

export interface UpdateSupportRequestStatusBody {
  readonly status: Exclude<SupportRequestStatus, "OPEN">;
  readonly note?: string | null;
}

export interface AdminReportQuery extends PaginationQuery {
  readonly status?: ReportStatus;
  readonly category?: ReportCategory;
}

export interface UpdateReportStatusBody {
  readonly status: Exclude<ReportStatus, "OPEN">;
  readonly note?: string | null;
}

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ReviewEligibilityReason = "INQUIRY_OPEN" | "NO_LANDLORD_REPLY" | "ALREADY_REVIEWED";
export type ReviewReportCategory = "INACCURATE" | "OFFENSIVE" | "HARASSMENT" | "SPAM" | "OTHER";
export type ReviewReportStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";

export interface ListingReview {
  readonly id: number;
  readonly inquiryId: number;
  readonly listingId: number;
  readonly overallRating: number;
  readonly accuracyRating: number;
  readonly responsivenessRating: number;
  readonly comment: string;
  readonly status: ReviewStatus;
  readonly moderationNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface ReviewEligibility {
  readonly eligible: boolean;
  readonly reason: ReviewEligibilityReason | null;
  readonly review: ListingReview | null;
}

export interface CreateReviewBody {
  readonly overallRating: number;
  readonly accuracyRating: number;
  readonly responsivenessRating: number;
  readonly comment: string;
}

export interface PublicListingReview {
  readonly id: number;
  readonly overallRating: number;
  readonly accuracyRating: number;
  readonly responsivenessRating: number;
  readonly comment: string;
  readonly createdAt: string;
  readonly verifiedInteraction: true;
}

export interface AdminListingReview extends ListingReview {
  readonly tenantId: number;
  readonly reviewedByAdminId: number | null;
  readonly updatedAt: string;
}

export interface CreateReviewReportBody {
  readonly category: ReviewReportCategory;
  readonly details?: string | null;
}

export interface ReviewReportReceipt {
  readonly id: number;
  readonly reviewId: number;
  readonly category: ReviewReportCategory;
  readonly status: "OPEN";
  readonly createdAt: string;
}

export interface AdminReviewReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
  readonly previousStatus: ReviewReportStatus | null;
  readonly newStatus: ReviewReportStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface AdminReviewReport {
  readonly id: number;
  readonly reviewId: number;
  readonly listingId: number;
  readonly reporterId: number;
  readonly category: ReviewReportCategory;
  readonly details: string | null;
  readonly status: ReviewReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly events?: readonly AdminReviewReportEvent[];
}

export interface AdminReviewReportQuery extends PaginationQuery {
  readonly status?: ReviewReportStatus;
  readonly category?: ReviewReportCategory;
}

export interface UpdateReviewReportStatusBody {
  readonly status: Exclude<ReviewReportStatus, "OPEN">;
  readonly note?: string | null;
}

export interface AdminReviewQuery extends PaginationQuery {
  readonly status?: ReviewStatus;
}

export interface ModerateReviewBody {
  readonly status: Exclude<ReviewStatus, "PENDING">;
  readonly note: string;
}

export type LeadView = "NEEDS_REPLY" | "REMINDERS" | "NEW" | "ACTIVE" | "CLOSED" | "ALL";

export interface LeadQuery extends PaginationQuery {
  readonly view?: LeadView;
}

export interface LandlordLead {
  readonly inquiryId: number;
  readonly listingId: number;
  readonly status: InquiryStatus;
  readonly contactPhone: string | null;
  readonly preferredContactAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMessage: {
    readonly senderRole: "TENANT" | "LANDLORD";
    readonly snippet: string;
    readonly createdAt: string;
  } | null;
  readonly needsReply: boolean;
  readonly hasUnreadTenantMessages: boolean;
  readonly note: string | null;
  readonly noteUpdatedAt: string | null;
  readonly reminderAt: string | null;
  readonly reminderUpdatedAt: string | null;
}

export interface LeadNoteState {
  readonly inquiryId: number;
  readonly note: string | null;
  readonly updatedAt: string | null;
}

export interface LeadReminderState {
  readonly inquiryId: number;
  readonly remindAt: string | null;
  readonly updatedAt: string | null;
}

export type AnalyticsPeriod = "7D" | "30D" | "90D";
export type AnalyticsEventType = "VIEW" | "FAVORITE" | "CALL_CLICK" | "EMAIL_CLICK";

export interface AnalyticsDailyPoint {
  readonly date: string;
  readonly inquiries: number;
  readonly firstResponses: number;
}

export interface AnalyticsListingRank {
  readonly listingId: number;
  readonly inquiries: number;
  readonly views: number;
  readonly favorites: number;
  readonly callClicks: number;
  readonly emailClicks: number;
}

export interface LandlordAnalytics {
  readonly period: AnalyticsPeriod;
  readonly sinceAt: string;
  readonly measuredAt: string;
  readonly inquiries: number;
  readonly uniqueTenants: number;
  readonly respondedInquiries: number;
  readonly respondedWithin24Hours: number;
  readonly responseRate: number;
  readonly responseWithin24HoursRate: number;
  readonly averageFirstResponseMinutes: number | null;
  readonly closedInquiries: number;
  readonly needsReplyNow: number;
  readonly views: number;
  readonly favorites: number;
  readonly callClicks: number;
  readonly emailClicks: number;
  readonly daily: readonly AnalyticsDailyPoint[];
  readonly topListings: readonly AnalyticsListingRank[];
}

export interface HealthResponse {
  readonly status: "ok" | "error";
  readonly database: "connected" | "unavailable";
}

export type RoommateSleepSchedule = "EARLY" | "STANDARD" | "LATE" | "FLEXIBLE";
export type RoommateCleanlinessLevel = "RELAXED" | "BALANCED" | "TIDY";
export type RoommateNoisePreference = "QUIET" | "BALANCED" | "SOCIAL";
export type RoommateSmokingEnvironment = "SMOKE_FREE" | "OUTDOOR_ONLY" | "NO_PREFERENCE";
export type RoommatePetEnvironment = "NO_PETS" | "OK_WITH_PETS" | "HAS_PET";
export type RoommateRequestStatus = "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
export type RoommateListingMode = "ALL" | "LINKED" | "UNLINKED";
export type RoommateInterestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "LEFT";
export type RoommateInterestDirection = "INCOMING" | "OUTGOING";
export type RoommateReportTargetType = "ROOMMATE_PROFILE" | "ROOMMATE_REQUEST" | "ROOMMATE_MESSAGE";
export type RoommateReportCategory =
  | "FRAUD"
  | "PAYMENT_SCAM"
  | "SPAM"
  | "HARASSMENT"
  | "IMPERSONATION"
  | "INAPPROPRIATE_CONTENT"
  | "OTHER";
export type RoommateReportStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";
export type RoommateModerationState = "VISIBLE" | "HIDDEN";

export type RoommateCompatibilityDimension =
  | "SLEEP"
  | "CLEANLINESS"
  | "NOISE"
  | "SMOKING"
  | "PETS"
  | "BUDGET"
  | "AREA"
  | "MOVE_IN";
export type RoommateCompatibilityOutcome = "ALIGNED" | "NEUTRAL" | "DISCUSS" | "IMPORTANT_DIFFERENCE" | "NOT_EVALUATED";
export type RoommateCompatibilityCategory = "HIGH_ALIGNMENT" | "MIXED" | "IMPORTANT_DIFFERENCE";
export type RoommateCompatibilityExplanationCode =
  | "SLEEP_NOT_EVALUATED"
  | "SLEEP_ALIGNED_SAME"
  | "SLEEP_NEUTRAL_FLEXIBLE"
  | "SLEEP_DISCUSS_DIFFERENT"
  | "CLEANLINESS_NOT_EVALUATED"
  | "CLEANLINESS_ALIGNED_SAME"
  | "CLEANLINESS_NEUTRAL_BALANCED"
  | "CLEANLINESS_DISCUSS_DIFFERENT"
  | "NOISE_NOT_EVALUATED"
  | "NOISE_ALIGNED_SAME"
  | "NOISE_NEUTRAL_BALANCED"
  | "NOISE_DISCUSS_DIFFERENT"
  | "SMOKING_NOT_EVALUATED"
  | "SMOKING_ALIGNED_SAME"
  | "SMOKING_NEUTRAL_NO_PREFERENCE"
  | "SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR"
  | "PETS_NOT_EVALUATED"
  | "PETS_ALIGNED_SAME"
  | "PETS_NEUTRAL_OK_WITH_PETS"
  | "PETS_IMPORTANT_DIFFERENCE_NO_PETS_HAS_PET"
  | "BUDGET_NOT_EVALUATED"
  | "BUDGET_ALIGNED_OVERLAP"
  | "BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP"
  | "AREA_NOT_EVALUATED"
  | "AREA_ALIGNED_OVERLAP"
  | "AREA_IMPORTANT_DIFFERENCE_NO_OVERLAP"
  | "MOVE_IN_NOT_EVALUATED"
  | "MOVE_IN_ALIGNED_OVERLAP"
  | "MOVE_IN_IMPORTANT_DIFFERENCE_NO_OVERLAP";

export interface RoommateCompatibilityDimensionResult {
  readonly dimension: RoommateCompatibilityDimension;
  readonly outcome: RoommateCompatibilityOutcome;
  readonly explanationCode: RoommateCompatibilityExplanationCode;
}

export interface RoommateCompatibility {
  readonly rulesVersion: "ROOMMATE_COMPAT_V2_1";
  readonly category: RoommateCompatibilityCategory | null;
  readonly evaluatedCount: number;
  readonly dimensions: readonly RoommateCompatibilityDimensionResult[];
}

export type RoommateCompatibilityResult = RoommateCompatibility;

export type RoommateRiskFlagCode =
  | "REPEATED_MESSAGE_ACROSS_THREADS"
  | "RAPID_INTEREST_ACTIVITY"
  | "HIGH_MESSAGE_VOLUME"
  | "REPEATED_EXTERNAL_CONTACT_SOLICITATION"
  | "REPEATED_REPORT_PATTERN"
  | "MULTIPLE_CURRENT_BLOCKERS"
  | "NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY";
export type RoommateRiskPriority = "ELEVATED" | "STANDARD";

export interface RoommateRiskEvidenceSummary {
  readonly messageIds?: readonly number[];
  readonly interestIds?: readonly number[];
  readonly reportIds?: readonly number[];
  readonly distinctCounterpartCount?: number;
  readonly distinctReporterCount?: number;
  readonly currentBlockerCount?: number;
  readonly accountCreatedAt?: string;
}

export interface RoommateRiskFlag {
  readonly code: RoommateRiskFlagCode;
  readonly observedCount: number | null;
  readonly windowStartedAt: string | null;
  readonly evidenceSummary: RoommateRiskEvidenceSummary;
}

export interface RoommateRiskSummary {
  readonly rulesVersion: "ROOMMATE_RISK_V2_1";
  readonly reviewPriority: RoommateRiskPriority;
  readonly partialEvaluation: boolean;
  readonly flags: readonly RoommateRiskFlag[];
  readonly evaluatedAt: string;
}

export interface RoommateProfile {
  readonly intro: string;
  readonly sleepSchedule: RoommateSleepSchedule;
  readonly cleanlinessLevel: RoommateCleanlinessLevel;
  readonly noisePreference: RoommateNoisePreference;
  readonly smokingEnvironment: RoommateSmokingEnvironment;
  readonly petEnvironment: RoommatePetEnvironment;
  readonly displayName: string | null;
  readonly memberSince: string;
  readonly emailVerified: boolean;
  readonly phoneVerified: boolean;
  readonly profileCompleted: boolean;
}

export interface RoommateProfileBody {
  readonly intro: string;
  readonly sleepSchedule: RoommateSleepSchedule;
  readonly cleanlinessLevel: RoommateCleanlinessLevel;
  readonly noisePreference: RoommateNoisePreference;
  readonly smokingEnvironment: RoommateSmokingEnvironment;
  readonly petEnvironment: RoommatePetEnvironment;
}

export type RoommateAiConfidence = "HIGH" | "MEDIUM" | "LOW";
export type RoommateAiPreferenceTarget = "PROFILE" | "REQUEST";
export type RoommateAiUnresolvedReason =
  | "AMBIGUOUS"
  | "UNSUPPORTED_PREFERENCE"
  | "SENSITIVE_OR_PROTECTED_ATTRIBUTE"
  | "NO_CANONICAL_VALUE"
  | "CONFLICTING_STATEMENTS";

export interface RoommateAiCapabilities {
  readonly preferenceParsing: boolean;
  readonly semanticRecommendations: boolean;
  readonly compatibilityExplanations: boolean;
  readonly safetyWarnings: boolean;
}

export interface RoommateAiEvidenceRange {
  readonly start: number;
  readonly end: number;
}

export interface RoommateAiPreferenceCandidate {
  readonly value: string | number | readonly string[];
  readonly confidence: RoommateAiConfidence;
  readonly evidenceRanges: readonly RoommateAiEvidenceRange[];
}

export interface RoommateAiPreferencePreview {
  readonly target: RoommateAiPreferenceTarget;
  readonly normalizedText: string;
  readonly proposal: Readonly<Record<string, RoommateAiPreferenceCandidate>>;
  readonly unresolved: readonly {
    readonly reason: RoommateAiUnresolvedReason;
    readonly evidenceRanges: readonly RoommateAiEvidenceRange[];
  }[];
  readonly requiresConfirmation: true;
  readonly parserVersion: "ROOMMATE_AI_PARSER_V3_1";
  readonly promptVersion: "ROOMMATE_AI_PARSER_PROMPT_V1";
}

export interface CreateRoommateAiPreferencePreviewBody {
  readonly target: RoommateAiPreferenceTarget;
  readonly text: string;
  readonly locale: "vi" | "en";
}

export type RoommateAiRecommendationReasonCode =
  | "SEMANTIC_SLEEP_ALIGNED"
  | "SEMANTIC_CLEANLINESS_ALIGNED"
  | "SEMANTIC_NOISE_ALIGNED"
  | "SEMANTIC_SMOKING_ALIGNED"
  | "SEMANTIC_PETS_ALIGNED"
  | "V2_BUDGET_ALIGNED"
  | "V2_AREA_ALIGNED"
  | "V2_MOVE_IN_ALIGNED";

export interface CreateRoommateAiRecommendationsBody {
  readonly filters: Omit<RoommateDiscoveryQuery, "page" | "pageSize">;
  readonly limit?: number;
  readonly locale?: "vi" | "en";
}

export interface RoommateRequest {
  readonly id: number;
  readonly listingId: number | null;
  readonly listingMode: Exclude<RoommateListingMode, "ALL">;
  readonly preferredAreaKeys: readonly string[];
  readonly budgetMinPerPerson: number;
  readonly budgetMaxPerPerson: number;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly note: string | null;
  readonly status: RoommateRequestStatus;
  readonly expiresAt: string;
  readonly listingLinkedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly profile: RoommateProfile | null;
  readonly listing: PublicListingSummary | null;
  readonly compatibility?: RoommateCompatibility | null;
  readonly signals: {
    readonly profileCompleted: boolean;
    readonly requestOpen: boolean;
    readonly listingCurrentlyAvailable: boolean | null;
  };
}

export interface RoommateAiRecommendationItem {
  readonly request: RoommateRequest;
  readonly recommendation: {
    readonly reasonCodes: readonly RoommateAiRecommendationReasonCode[];
    readonly semanticRulesVersion: "ROOMMATE_AI_SEMANTIC_V3_1";
  };
}

export interface RoommateAiRecommendations {
  readonly items: readonly RoommateAiRecommendationItem[];
  readonly candidateWindowSize: number;
  readonly reason: "INSUFFICIENT_SEMANTIC_EVIDENCE" | null;
  readonly generatedAt: string;
}

export interface CreateRoommateRequestBody {
  readonly listingId: number | null;
  readonly preferredAreaKeys: readonly string[];
  readonly budgetMinPerPerson: number;
  readonly budgetMaxPerPerson: number;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly note?: string | null;
}

export interface UpdateRoommateRequestBody {
  readonly preferredAreaKeys?: readonly string[];
  readonly budgetMinPerPerson?: number;
  readonly budgetMaxPerPerson?: number;
  readonly moveInFrom?: string;
  readonly moveInUntil?: string;
  readonly note?: string | null;
}

export interface RoommateDiscoveryQuery extends PaginationQuery {
  readonly area?: string;
  readonly budgetMinPerPerson?: number;
  readonly budgetMaxPerPerson?: number;
  readonly moveInFrom?: string;
  readonly moveInUntil?: string;
  readonly listingMode?: RoommateListingMode;
}

export interface RoommateMineQuery extends PaginationQuery {
  readonly status?: RoommateRequestStatus;
}

export interface RoommateInterestMessage {
  readonly id: number;
  readonly body: string;
  readonly createdAt: string;
  readonly isRead: boolean;
}

export interface RoommateInterest {
  readonly id: number;
  readonly requestId: number;
  readonly direction: RoommateInterestDirection;
  readonly status: RoommateInterestStatus;
  readonly acceptedAt: string | null;
  readonly endedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly request: RoommateRequest;
  readonly counterpart: RoommateProfile | null;
  readonly initialMessage: RoommateInterestMessage | null;
}

export interface RoommateInterestQuery extends PaginationQuery {
  readonly direction: RoommateInterestDirection;
  readonly status?: RoommateInterestStatus;
}

export interface RoommateConnection {
  readonly interestId: number;
  readonly requestId: number;
  readonly connectedAt: string;
  readonly counterpart: RoommateProfile | null;
  readonly request: RoommateRequest;
}

export interface RoommateMessage {
  readonly id: number;
  readonly sender: "SELF" | "COUNTERPART";
  readonly body: string;
  readonly createdAt: string;
  readonly isRead: boolean;
}

export interface RoommateBlockState {
  readonly blocked: boolean;
}

export interface RoommateOwnedBlock {
  readonly blockedAt: string;
  readonly counterpart: Readonly<{
    displayName: string | null;
    memberSince: string | null;
  }>;
  readonly unblockAction: Readonly<{ kind: "REQUEST"; id: number }> | Readonly<{ kind: "INTEREST"; id: number }>;
}

export interface CreateRoommateRequestReportBody {
  readonly targetType: Extract<RoommateReportTargetType, "ROOMMATE_PROFILE" | "ROOMMATE_REQUEST">;
  readonly category: RoommateReportCategory;
  readonly details?: string | null;
}

export interface CreateRoommateReportBody {
  readonly category: RoommateReportCategory;
  readonly details?: string | null;
}

export interface RoommateReportReceipt {
  readonly id: number;
  readonly targetType: RoommateReportTargetType;
  readonly category: RoommateReportCategory;
  readonly status: RoommateReportStatus;
  readonly createdAt: string;
}

export interface AdminRoommateReportEvent {
  readonly eventType: string;
  readonly previousStatus: string | null;
  readonly newStatus: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface AdminRoommateReport extends RoommateReportReceipt {
  readonly details: string | null;
  readonly resolutionNote: string | null;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly reporter: {
    readonly displayName: string | null;
    readonly memberSince: string | null;
  };
  readonly subject: {
    readonly requestId: number;
    readonly messageId: number | null;
    readonly profileTenantId?: number;
  };
  readonly riskSummary?: RoommateRiskSummary | null;
  readonly evidenceSnapshot?: Readonly<Record<string, unknown>>;
  readonly events?: readonly AdminRoommateReportEvent[];
}

export interface AdminRoommateReportQuery extends PaginationQuery {
  readonly status?: RoommateReportStatus;
  readonly category?: RoommateReportCategory;
  readonly reviewPriority?: RoommateRiskPriority;
}

export interface UpdateRoommateReportStatusBody {
  readonly status: Exclude<RoommateReportStatus, "OPEN">;
  readonly note?: string | null;
}

export interface RoommateModerationBody {
  readonly state: RoommateModerationState;
  readonly note?: string | null;
  readonly reportId: number;
}

export interface RoommateModerationResult {
  readonly targetType: RoommateReportTargetType;
  readonly state: RoommateModerationState;
}
