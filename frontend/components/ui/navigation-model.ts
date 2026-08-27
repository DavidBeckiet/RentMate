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

const tenantPrimaryItems: readonly NavigationItem[] = [
  ...marketplaceItems,
  {
    key: "favorites",
    label: "Yêu thích",
    href: "/favorites",
    icon: "heart",
    exactPaths: ["/favorites"]
  },
  {
    key: "inquiries",
    label: "Tin nhắn",
    href: "/inquiries",
    icon: "message",
    exactPaths: ["/inquiries"],
    pathPrefixes: ["/inquiries/"]
  },
  {
    key: "roommates",
    label: "Ở ghép",
    href: "/roommates",
    icon: "users",
    exactPaths: ["/roommates"],
    pathPrefixes: ["/roommates/"]
  }
];

const landlordMarketplaceItems: readonly NavigationItem[] = [
  marketplaceItems[0],
  marketplaceItems[1],
  {
    key: "landlord-workspace",
    label: "Không gian cho thuê",
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
    key: "saved-searches",
    label: "Bộ lọc đã lưu",
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
    label: "Tin đăng",
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
    label: "Leads",
    href: "/landlord/leads",
    icon: "users",
    pathPrefixes: ["/landlord/leads"]
  },
  {
    key: "landlord-analytics",
    label: "Analytics",
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

export const adminNavigationItems: readonly NavigationItem[] = [
  {
    key: "admin-listings",
    label: "Kiểm duyệt tin",
    href: "/admin",
    icon: "clipboard",
    exactPaths: ["/admin"],
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
    key: "admin-reports",
    label: "Báo cáo",
    href: "/admin/reports",
    icon: "flag",
    pathPrefixes: ["/admin/reports"]
  },
  {
    key: "admin-contact-reports",
    label: "Báo cáo contact",
    href: "/admin/contact-reports",
    icon: "message",
    pathPrefixes: ["/admin/contact-reports"]
  },
  {
    key: "admin-roommate-reports",
    label: "Báo cáo ở ghép",
    href: "/admin/roommate-reports",
    icon: "users",
    pathPrefixes: ["/admin/roommate-reports"]
  },
  {
    key: "admin-support-requests",
    label: "Yêu cầu hỗ trợ",
    href: "/admin/support-requests",
    icon: "message",
    pathPrefixes: ["/admin/support-requests"]
  },
  {
    key: "admin-reviews",
    label: "Reviews",
    href: "/admin/reviews",
    icon: "star",
    pathPrefixes: ["/admin/reviews"]
  },
  {
    key: "admin-review-reports",
    label: "Báo cáo review",
    href: "/admin/review-reports",
    icon: "flag",
    pathPrefixes: ["/admin/review-reports"]
  },
  {
    key: "admin-verifications",
    label: "Xác minh",
    href: "/admin/verifications",
    icon: "shield",
    pathPrefixes: ["/admin/verifications"]
  }
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
  return marketplaceItems;
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
