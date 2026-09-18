import type { UserRole } from "../../types/api";
import type { IconName } from "./icon";

export type NavigationActor = "anonymous" | "tenant" | "landlord" | "admin" | "loading" | "error";
export type WorkspaceActor = "landlord" | "admin";
export type ShellKind = "auth" | "consumer" | "landlord" | "admin" | "restricted";

export interface NavigationItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly exactPaths?: readonly string[];
  readonly pathPrefixes?: readonly string[];
}

const marketplaceItems: readonly NavigationItem[] = [
  {
    key: "home",
    label: "Trang chủ",
    href: "/",
    icon: "home",
    exactPaths: ["/"]
  },
  {
    key: "search",
    label: "Tìm phòng",
    href: "/search",
    icon: "search",
    exactPaths: ["/search"],
    pathPrefixes: ["/listings/"]
  },
  {
    key: "near-me",
    label: "Gần tôi",
    href: "/near-me",
    icon: "compass",
    exactPaths: ["/near-me"]
  },
  {
    key: "recently-viewed",
    label: "Đã xem",
    href: "/recently-viewed",
    icon: "eye",
    exactPaths: ["/recently-viewed"]
  }
];

export const publicNavigationItems: readonly NavigationItem[] = [
  ...marketplaceItems,
  {
    key: "roommates",
    label: "Ở ghép",
    href: "/roommates",
    icon: "users",
    exactPaths: ["/roommates"],
    pathPrefixes: ["/roommates/"]
  }
];

const tenantPrimaryItems: readonly NavigationItem[] = [
  marketplaceItems[0],
  marketplaceItems[1],
  marketplaceItems[2],
  {
    key: "roommates",
    label: "Ở ghép",
    href: "/roommates",
    icon: "users",
    exactPaths: ["/roommates"],
    pathPrefixes: ["/roommates/"]
  },
  {
    key: "inquiries",
    label: "Tin nhắn",
    href: "/inquiries",
    icon: "message",
    exactPaths: ["/inquiries"],
    pathPrefixes: ["/inquiries/"]
  }
];

export const roommateNavigationItems: readonly NavigationItem[] = [
  {
    key: "roommate-discover",
    label: "Khám phá",
    href: "/roommates",
    icon: "compass",
    exactPaths: ["/roommates"],
    pathPrefixes: ["/roommates/requests/"]
  },
  {
    key: "roommate-request",
    label: "Nhu cầu của tôi",
    href: "/roommates/my-request",
    icon: "note",
    exactPaths: ["/roommates/my-request"]
  },
  {
    key: "roommate-interests",
    label: "Quan tâm",
    href: "/roommates/interests",
    icon: "heart",
    exactPaths: ["/roommates/interests"]
  },
  {
    key: "roommate-connections",
    label: "Kết nối",
    href: "/roommates/connection",
    icon: "users",
    exactPaths: ["/roommates/connection"]
  },
  {
    key: "roommate-messages",
    label: "Tin nhắn",
    href: "/roommates/messages",
    icon: "message",
    exactPaths: ["/roommates/messages"],
    pathPrefixes: ["/roommates/conversations/"]
  }
];

export const roommateManagementItems: readonly NavigationItem[] = [
  {
    key: "roommate-profile",
    label: "Hồ sơ ở ghép",
    href: "/roommates/profile",
    icon: "user",
    exactPaths: ["/roommates/profile"]
  },
  {
    key: "roommate-blocked",
    label: "Đã chặn",
    href: "/roommates/blocked",
    icon: "lock",
    exactPaths: ["/roommates/blocked", "/roommates/blocks"]
  }
];

const landlordMarketplaceItems: readonly NavigationItem[] = [
  {
    key: "landlord-workspace",
    label: "Quản lý cho thuê",
    href: "/landlord",
    icon: "building",
    pathPrefixes: ["/landlord"]
  }
];

const adminMarketplaceItems: readonly NavigationItem[] = [
  marketplaceItems[0],
  marketplaceItems[1],
  {
    key: "admin-workspace",
    label: "Khu vực quản trị",
    href: "/admin",
    icon: "shield",
    pathPrefixes: ["/admin"]
  }
];

export const tenantSecondaryItems: readonly NavigationItem[] = [
  {
    key: "favorites",
    label: "Yêu thích",
    href: "/favorites",
    icon: "heart",
    exactPaths: ["/favorites"]
  },
  {
    key: "recently-viewed",
    label: "Đã xem gần đây",
    href: "/recently-viewed",
    icon: "eye",
    exactPaths: ["/recently-viewed"]
  },
  {
    key: "saved-searches",
    label: "Tìm kiếm đã lưu",
    href: "/saved-searches",
    icon: "sliders",
    exactPaths: ["/saved-searches"]
  },
  {
    key: "compare",
    label: "So sánh tin",
    href: "/compare",
    icon: "compare",
    exactPaths: ["/compare"]
  }
];

export const landlordNavigationItems: readonly NavigationItem[] = [
  {
    key: "landlord-listings",
    label: "Tin cho thuê",
    href: "/landlord",
    icon: "building",
    exactPaths: ["/landlord"],
    pathPrefixes: ["/landlord/listings/"]
  },
  {
    key: "landlord-inquiries",
    label: "Tin nhắn",
    href: "/landlord/inquiries",
    icon: "message",
    pathPrefixes: ["/landlord/inquiries", "/inquiries/"]
  },
  {
    key: "landlord-leads",
    label: "Khách quan tâm",
    href: "/landlord/leads",
    icon: "users",
    pathPrefixes: ["/landlord/leads"]
  },
  {
    key: "landlord-analytics",
    label: "Phân tích",
    href: "/landlord/analytics",
    icon: "chart",
    pathPrefixes: ["/landlord/analytics"]
  },
  {
    key: "landlord-profile",
    label: "Hồ sơ & xác minh",
    href: "/landlord/profile",
    icon: "shield",
    pathPrefixes: ["/landlord/profile"]
  }
];

export const adminOperationsNavigationItems: readonly NavigationItem[] = [
  {
    key: "admin-overview",
    label: "Tổng quan",
    href: "/admin",
    icon: "chart",
    exactPaths: ["/admin"]
  },
  {
    key: "admin-listings",
    label: "Kiểm duyệt tin",
    href: "/admin/listings",
    icon: "clipboard",
    exactPaths: ["/admin/listings"],
    pathPrefixes: ["/admin/listings/"]
  },
  {
    key: "admin-users",
    label: "Người dùng",
    href: "/admin/users",
    icon: "users",
    pathPrefixes: ["/admin/users"]
  },
  {
    key: "admin-verifications",
    label: "Xác minh chủ trọ",
    href: "/admin/verifications",
    icon: "shield",
    pathPrefixes: ["/admin/verifications"]
  }
];

export const adminSupportNavigationItems: readonly NavigationItem[] = [
  {
    key: "admin-support-requests",
    label: "Yêu cầu hỗ trợ",
    href: "/admin/support-requests",
    icon: "message",
    pathPrefixes: ["/admin/support-requests"]
  },
  {
    key: "admin-reviews",
    label: "Đánh giá",
    href: "/admin/reviews",
    icon: "star",
    pathPrefixes: ["/admin/reviews"]
  }
];

export const adminReportNavigationItems: readonly NavigationItem[] = [
  {
    key: "admin-reports",
    label: "Tin đăng",
    href: "/admin/reports",
    icon: "flag",
    pathPrefixes: ["/admin/reports"]
  },
  {
    key: "admin-contact-reports",
    label: "Liên hệ",
    href: "/admin/contact-reports",
    icon: "message",
    pathPrefixes: ["/admin/contact-reports"]
  },
  {
    key: "admin-roommate-reports",
    label: "Ở ghép",
    href: "/admin/roommate-reports",
    icon: "users",
    pathPrefixes: ["/admin/roommate-reports"]
  },
  {
    key: "admin-review-reports",
    label: "Đánh giá",
    href: "/admin/review-reports",
    icon: "flag",
    pathPrefixes: ["/admin/review-reports"]
  }
];

export const adminNavigationItems: readonly NavigationItem[] = [
  ...adminOperationsNavigationItems,
  ...adminSupportNavigationItems,
  ...adminReportNavigationItems
];

export function navigationActor(
  role: UserRole | null,
  status: "loading" | "anonymous" | "authenticated" | "error"
): NavigationActor {
  if (status === "authenticated") return role ? (role.toLowerCase() as NavigationActor) : "loading";
  return status;
}

export function consumerNavigationItems(actor: NavigationActor): readonly NavigationItem[] {
  if (actor === "tenant") return tenantPrimaryItems;
  if (actor === "landlord") return landlordMarketplaceItems;
  if (actor === "admin") return adminMarketplaceItems;
  if (actor === "loading" || actor === "error") return marketplaceItems.slice(0, 1);
  return actor === "anonymous" ? publicNavigationItems : marketplaceItems;
}

export function isNavigationItemActive(item: NavigationItem, pathname: string): boolean {
  return Boolean(
    item.exactPaths?.includes(pathname) || item.pathPrefixes?.some((prefix) => pathname.startsWith(prefix))
  );
}

export function resolveShellKind(pathname: string, actor: NavigationActor): ShellKind {
  if (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/register" ||
    pathname.startsWith("/register/") ||
    pathname === "/admin/login"
  )
    return "auth";

  const requestedWorkspace: WorkspaceActor | null = pathname.startsWith("/landlord")
    ? "landlord"
    : pathname.startsWith("/admin")
      ? "admin"
      : null;

  if (requestedWorkspace) {
    if (actor === "loading") return requestedWorkspace;
    return actor === requestedWorkspace ? requestedWorkspace : "restricted";
  }

  const sharedWorkspaceRoute = pathname === "/notifications" || pathname.startsWith("/inquiries/");
  if (sharedWorkspaceRoute && (actor === "landlord" || actor === "admin")) return actor;

  return "consumer";
}
