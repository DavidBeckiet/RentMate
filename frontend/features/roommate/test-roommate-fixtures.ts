import type {
  PublicListingSummary,
  RoommateInterest,
  RoommateMessage,
  RoommateProfile,
  RoommateRequest,
  UserProfile
} from "../../types/api";

export const tenantUser: UserProfile = {
  id: 7,
  role: "TENANT",
  displayName: "Nguyễn An",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

export function roommateProfile(overrides: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    intro: "Mình thích không gian gọn gàng, tôn trọng giờ nghỉ và trao đổi thẳng thắn.",
    sleepSchedule: "STANDARD",
    cleanlinessLevel: "BALANCED",
    noisePreference: "QUIET",
    smokingEnvironment: "SMOKE_FREE",
    petEnvironment: "OK_WITH_PETS",
    displayName: "Bạn cùng phòng",
    memberSince: "2025-10-01T00:00:00.000Z",
    profileCompleted: true,
    ...overrides
  };
}

export function listingSummary(overrides: Partial<PublicListingSummary> = {}): PublicListingSummary {
  return {
    id: 23,
    businessStatus: "AVAILABLE",
    title: "Studio gần trung tâm",
    monthlyRent: 8_000_000,
    roomAreaSqm: 28,
    maxOccupants: 2,
    areaName: "Quận 3",
    latitude: 10.782,
    longitude: 106.682,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    coverImage: { url: "https://example.test/room.jpg", altText: null, displayOrder: 1 },
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides
  };
}

export function roommateRequest(overrides: Partial<RoommateRequest> = {}): RoommateRequest {
  return {
    id: 42,
    listingId: null,
    listingMode: "UNLINKED",
    preferredAreaKeys: ["Quận 3"],
    budgetMinPerPerson: 3_000_000,
    budgetMaxPerPerson: 5_000_000,
    moveInFrom: "2026-09-01",
    moveInUntil: "2026-09-30",
    note: "Ưu tiên trao đổi rõ ràng trước khi gặp xem phòng.",
    status: "OPEN",
    expiresAt: "2026-09-20T00:00:00.000Z",
    listingLinkedAt: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    profile: roommateProfile(),
    listing: null,
    signals: { profileCompleted: true, requestOpen: true, listingCurrentlyAvailable: null },
    ...overrides
  };
}

export function roommateInterest(overrides: Partial<RoommateInterest> = {}): RoommateInterest {
  const request = overrides.request ?? roommateRequest();
  return {
    id: 91,
    requestId: request.id,
    direction: "INCOMING",
    status: "PENDING",
    acceptedAt: null,
    endedAt: null,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    request,
    counterpart: roommateProfile({ displayName: "Minh" }),
    initialMessage: {
      id: 101,
      body: "Mình muốn tìm hiểu thêm trước khi cùng xem phòng.",
      createdAt: "2026-08-21T00:00:00.000Z",
      isRead: false
    },
    ...overrides
  };
}

export function roommateMessage(overrides: Partial<RoommateMessage> = {}): RoommateMessage {
  return {
    id: 301,
    sender: "COUNTERPART",
    body: "Chào bạn, mình có thể trao đổi thêm về nhu cầu ở ghép.",
    createdAt: "2026-08-21T09:00:00.000Z",
    isRead: false,
    ...overrides
  };
}
