export type UserRole = "TENANT" | "LANDLORD" | "ADMIN";

export type ListingStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";

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

export interface HealthResponse {
  readonly status: "ok" | "error";
  readonly database: "connected" | "unavailable";
}
