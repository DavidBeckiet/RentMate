import type { IconName } from "../../components/ui/icon";
import type { Notification, NotificationEventType } from "../../types/api";

export interface NotificationPresentation {
  readonly title: string;
  readonly description: string;
  readonly category: "Tin nhắn" | "Tin đăng" | "Tìm kiếm đã lưu" | "Ở ghép" | "Nhắc nhở" | "Khác";
  readonly icon: IconName;
  readonly destination: string;
}

interface EventCopy {
  readonly title: string;
  readonly description: string;
  readonly category: NotificationPresentation["category"];
  readonly icon: IconName;
}

const eventCopy: Record<NotificationEventType, EventCopy> = {
  INQUIRY_CREATED: {
    title: "Có yêu cầu liên hệ mới",
    description: "Bạn vừa nhận được một yêu cầu liên hệ mới.",
    category: "Tin nhắn",
    icon: "message"
  },
  MESSAGE_CREATED: {
    title: "Tin nhắn mới",
    description: "Cuộc trò chuyện của bạn có tin nhắn mới.",
    category: "Tin nhắn",
    icon: "message"
  },
  INQUIRY_STATUS_CHANGED: {
    title: "Yêu cầu liên hệ được cập nhật",
    description: "Yêu cầu liên hệ của bạn vừa được cập nhật.",
    category: "Tin nhắn",
    icon: "message"
  },
  LEAD_REMINDER_DUE: {
    title: "Đến lúc theo dõi yêu cầu",
    description: "Đã đến lúc theo dõi yêu cầu liên hệ này.",
    category: "Nhắc nhở",
    icon: "bell"
  },
  LISTING_APPROVED: {
    title: "Tin đăng đã được duyệt",
    description: "Tin đăng của bạn đã được duyệt và có thể tiếp tục hiển thị.",
    category: "Tin đăng",
    icon: "home"
  },
  LISTING_REJECTED: {
    title: "Tin đăng cần được chỉnh sửa",
    description: "Tin đăng của bạn cần được xem lại trước khi gửi lại.",
    category: "Tin đăng",
    icon: "home"
  },
  LISTING_HIDDEN: {
    title: "Tin đăng đã được ẩn",
    description: "Tin đăng của bạn hiện đã được ẩn khỏi kết quả tìm kiếm.",
    category: "Tin đăng",
    icon: "home"
  },
  SAVED_SEARCH_MATCHED: {
    title: "Có tin đăng mới phù hợp",
    description: "Một tin đăng mới phù hợp với tìm kiếm bạn đã lưu.",
    category: "Tìm kiếm đã lưu",
    icon: "search"
  },
  LISTING_AVAILABILITY_REMINDER: {
    title: "Tin đăng cần cập nhật",
    description: "Tin đăng của bạn cần được cập nhật tình trạng còn phòng.",
    category: "Nhắc nhở",
    icon: "bell"
  },
  ROOMMATE_INTEREST_RECEIVED: {
    title: "Có lời quan tâm ở ghép mới",
    description: "Bạn vừa nhận được một lời quan tâm ở ghép mới.",
    category: "Ở ghép",
    icon: "users"
  },
  ROOMMATE_INTEREST_ACCEPTED: {
    title: "Lời quan tâm ở ghép đã được chấp nhận",
    description: "Lời quan tâm ở ghép của bạn đã được chấp nhận.",
    category: "Ở ghép",
    icon: "users"
  },
  ROOMMATE_INTEREST_REJECTED: {
    title: "Lời quan tâm ở ghép không còn hiệu lực",
    description: "Lời quan tâm ở ghép này không còn hiệu lực.",
    category: "Ở ghép",
    icon: "users"
  },
  ROOMMATE_INTEREST_WITHDRAWN: {
    title: "Lời quan tâm ở ghép đã được rút lại",
    description: "Một lời quan tâm ở ghép đã được rút lại.",
    category: "Ở ghép",
    icon: "users"
  },
  ROOMMATE_MESSAGE_RECEIVED: {
    title: "Tin nhắn ở ghép mới",
    description: "Cuộc trò chuyện ở ghép của bạn có tin nhắn mới.",
    category: "Ở ghép",
    icon: "message"
  },
  ROOMMATE_CONNECTION_LEFT: {
    title: "Kết nối ở ghép đã kết thúc",
    description: "Kết nối ở ghép này đã được kết thúc.",
    category: "Ở ghép",
    icon: "users"
  },
  ROOMMATE_REQUEST_EXPIRING: {
    title: "Yêu cầu ở ghép sắp hết hạn",
    description: "Yêu cầu tìm người ở ghép của bạn sắp hết hạn.",
    category: "Nhắc nhở",
    icon: "bell"
  },
  ROOMMATE_REQUEST_EXPIRED: {
    title: "Yêu cầu ở ghép đã hết hạn",
    description: "Yêu cầu tìm người ở ghép của bạn đã hết hạn.",
    category: "Ở ghép",
    icon: "bell"
  }
};

export const notificationEventTypes = Object.keys(eventCopy) as NotificationEventType[];

function allowedResourcePath(resourcePath: string, prefixes: readonly string[]): string | null {
  return prefixes.some((prefix) => resourcePath.startsWith(prefix)) ? resourcePath : null;
}

export function notificationDestination(notification: Notification): string {
  if (notification.eventType === "ROOMMATE_REQUEST_EXPIRING" || notification.eventType === "ROOMMATE_REQUEST_EXPIRED") {
    return notification.roommateRequestId !== null
      ? `/roommates/requests/${notification.roommateRequestId}`
      : "/roommates/my-request";
  }

  if (
    notification.eventType === "ROOMMATE_INTEREST_RECEIVED" ||
    notification.eventType === "ROOMMATE_INTEREST_ACCEPTED" ||
    notification.eventType === "ROOMMATE_INTEREST_REJECTED" ||
    notification.eventType === "ROOMMATE_INTEREST_WITHDRAWN" ||
    notification.eventType === "ROOMMATE_MESSAGE_RECEIVED" ||
    notification.eventType === "ROOMMATE_CONNECTION_LEFT"
  ) {
    return notification.roommateInterestId !== null
      ? `/roommates/conversations/${notification.roommateInterestId}`
      : "/roommates";
  }

  if (
    notification.eventType === "INQUIRY_CREATED" ||
    notification.eventType === "MESSAGE_CREATED" ||
    notification.eventType === "INQUIRY_STATUS_CHANGED" ||
    notification.eventType === "LEAD_REMINDER_DUE"
  ) {
    return notification.inquiryId !== null
      ? `/inquiries/${notification.inquiryId}`
      : (allowedResourcePath(notification.resourcePath, ["/inquiries/"]) ?? "/notifications");
  }

  if (
    notification.eventType === "LISTING_APPROVED" ||
    notification.eventType === "LISTING_REJECTED" ||
    notification.eventType === "LISTING_HIDDEN" ||
    notification.eventType === "LISTING_AVAILABILITY_REMINDER"
  ) {
    return notification.listingId !== null
      ? `/landlord/listings/${notification.listingId}`
      : (allowedResourcePath(notification.resourcePath, ["/landlord/listings/"]) ?? "/notifications");
  }

  if (notification.eventType === "SAVED_SEARCH_MATCHED") {
    return notification.listingId !== null
      ? `/listings/${notification.listingId}`
      : (allowedResourcePath(notification.resourcePath, ["/listings/"]) ?? "/notifications");
  }

  return "/notifications";
}

export function presentNotification(notification: Notification): NotificationPresentation {
  const copy = eventCopy[notification.eventType as NotificationEventType];
  if (!copy) {
    return {
      title: "Cập nhật mới",
      description: "Có một cập nhật mới trong tài khoản RentMate.",
      category: "Khác",
      icon: "bell",
      destination: "/notifications"
    };
  }
  return { ...copy, destination: notificationDestination(notification) };
}

export function formatNotificationAbsoluteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Thời gian không xác định";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatNotificationRelativeTime(value: string, now = new Date()): string {
  const date = new Date(value);
  const timestamp = date.getTime();
  const currentTimestamp = now.getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(currentTimestamp)) return "Thời gian không xác định";

  const elapsedMs = Math.max(0, currentTimestamp - timestamp);
  const minute = Math.floor(elapsedMs / 60_000);
  const hour = Math.floor(elapsedMs / 3_600_000);
  const day = Math.floor(elapsedMs / 86_400_000);
  if (minute < 1) return "Vừa xong";
  if (minute < 60) return `${minute} phút trước`;
  if (hour < 24) return `${hour} giờ trước`;
  if (day === 1) return "Hôm qua";
  if (day < 7) return `${day} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}
