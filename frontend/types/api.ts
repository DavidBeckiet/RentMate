export type UserRole = "TENANT" | "LANDLORD" | "ADMIN";

export type ListingStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";
export type InquiryStatus = "NEW" | "CONTACTED" | "CLOSED";
export type NotificationEventType = "INQUIRY_CREATED" | "MESSAGE_CREATED" | "INQUIRY_STATUS_CHANGED";

export type ModerationAction = "APPROVE" | "REJECT" | "HIDE" | "RESTORE";

export interface UserProfile {
  readonly id: number;
  readonly role: UserRole;
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
  readonly title: string;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly areaName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly propertyType: PropertyType;
  readonly amenities: readonly Amenity[];
  readonly coverImage: PublicImage;
  readonly distanceKm?: number;
  readonly updatedAt: string;
}

export interface LandlordContact {
  readonly email: string;
  readonly phone: string;
}

export interface PublicListingDetail extends Omit<PublicListingSummary, "coverImage"> {
  readonly description: string;
  readonly images: readonly PublicImage[];
  readonly landlordContact?: LandlordContact;
}

export interface OwnerListingSummary {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly monthlyRent: number | null;
  readonly areaName: string | null;
  readonly propertyType: PropertyType | null;
  readonly coverImage: OwnerImage | null;
  readonly currentModerationReason: string | null;
  readonly updatedAt: string;
}

export interface OwnerListingDetail {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
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
  readonly title: string | null;
  readonly areaName: string | null;
  readonly landlord: AdminListingLandlord;
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
  readonly email: string;
  readonly password: string;
  readonly phone?: string | null;
}

export interface LandlordRegistrationBody {
  readonly email: string;
  readonly password: string;
  readonly phone: string;
}

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

export interface UpdateCurrentUserBody {
  readonly phone: string | null;
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
  readonly addressText?: string | null;
  readonly areaName?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly amenityCodes?: readonly string[];
}

export interface OwnedListingQuery extends PaginationQuery {
  readonly status?: ListingStatus;
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
  readonly inquiryId: number;
  readonly resourcePath: string;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export type SavedSearchMode = "ordinary" | "bounds" | "radius";

export interface SavedSearchQuery {
  readonly q: string | null;
  readonly areaName: string | null;
  readonly minMonthlyRent: number | null;
  readonly maxMonthlyRent: number | null;
  readonly minRoomAreaSqm: number | null;
  readonly maxRoomAreaSqm: number | null;
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

export interface AdminReportQuery extends PaginationQuery {
  readonly status?: ReportStatus;
  readonly category?: ReportCategory;
}

export interface UpdateReportStatusBody {
  readonly status: Exclude<ReportStatus, "OPEN">;
  readonly note?: string | null;
}

export interface HealthResponse {
  readonly status: "ok" | "error";
  readonly database: "connected" | "unavailable";
}
