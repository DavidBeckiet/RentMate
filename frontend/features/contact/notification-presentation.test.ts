import { describe, expect, it } from "vitest";
import type { Notification, NotificationEventType } from "../../types/api";
import {
  formatNotificationRelativeTime,
  notificationEventTypes,
  presentNotification
} from "./notification-presentation";

const now = new Date("2026-09-08T12:00:00.000Z");

function notification(eventType: NotificationEventType, overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    eventType,
    inquiryId: eventType === "INQUIRY_CREATED" ? 11 : null,
    listingId: eventType === "SAVED_SEARCH_MATCHED" ? 22 : null,
    roommateRequestId:
      eventType === "ROOMMATE_REQUEST_EXPIRING" || eventType === "ROOMMATE_REQUEST_EXPIRED" ? 33 : null,
    roommateInterestId:
      eventType === "ROOMMATE_MESSAGE_RECEIVED" || eventType === "ROOMMATE_INTEREST_RECEIVED" ? 44 : null,
    resourcePath: "/notifications/1",
    isRead: false,
    createdAt: "2026-09-08T11:55:00.000Z",
    ...overrides
  };
}

describe("notification presentation", () => {
  it("covers every current notification event without exposing enum names", () => {
    expect(notificationEventTypes).toHaveLength(17);
    for (const eventType of notificationEventTypes) {
      const presentation = presentNotification(notification(eventType));
      expect(presentation.title).not.toContain(eventType);
      expect(presentation.description).not.toContain(eventType);
      expect(presentation.destination).not.toContain("undefined");
    }
  });

  it("uses the frontend roommate request detail route when an id is present", () => {
    expect(presentNotification(notification("ROOMMATE_REQUEST_EXPIRED")).destination).toBe("/roommates/requests/33");
  });

  it("uses bounded neutral copy for roommate interest events", () => {
    const presentation = presentNotification(notification("ROOMMATE_INTEREST_REJECTED"));
    expect(presentation.description).toBe("Lời quan tâm ở ghép này không còn hiệu lực.");
    expect(presentation.description).not.toContain("bị từ chối");
  });

  it("preserves each current notification family destination", () => {
    expect(presentNotification(notification("INQUIRY_CREATED", { inquiryId: 12 })).destination).toBe("/inquiries/12");
    expect(presentNotification(notification("LISTING_APPROVED", { listingId: 24 })).destination).toBe(
      "/landlord/listings/24"
    );
    expect(presentNotification(notification("SAVED_SEARCH_MATCHED", { listingId: 36 })).destination).toBe(
      "/listings/36"
    );
    expect(presentNotification(notification("ROOMMATE_MESSAGE_RECEIVED", { roommateInterestId: 48 })).destination).toBe(
      "/roommates/conversations/48"
    );
    expect(presentNotification(notification("ROOMMATE_REQUEST_EXPIRING", { roommateRequestId: 60 })).destination).toBe(
      "/roommates/requests/60"
    );
  });

  it("falls back safely for an unknown future event", () => {
    const future = notification("MESSAGE_CREATED");
    const presentation = presentNotification({ ...future, eventType: "FUTURE_EVENT" } as unknown as Notification);
    expect(presentation.destination).toBe("/notifications");
    expect(presentation.title).toBe("Cập nhật mới");
    expect(presentation.title).not.toContain("FUTURE_EVENT");
  });

  it("formats recent timestamps in Vietnamese", () => {
    expect(formatNotificationRelativeTime("2026-09-08T11:59:40.000Z", now)).toBe("Vừa xong");
    expect(formatNotificationRelativeTime("2026-09-08T11:45:00.000Z", now)).toBe("15 phút trước");
    expect(formatNotificationRelativeTime("2026-09-07T12:00:00.000Z", now)).toBe("Hôm qua");
  });
});
