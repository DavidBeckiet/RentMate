import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserProfile, UserRole } from "../../types/api";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { AccountMenu } from "./account-menu";

function user(role: UserRole): UserProfile {
  return {
    id: 1,
    displayName: "Nguyễn Văn An",
    role,
    email: `${role.toLowerCase()}@example.com`,
    phone: role === "LANDLORD" ? "+84901234567" : null,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

describe("AccountMenu", () => {
  it("provides landlord destinations and closes on an outside pointer", () => {
    render(
      <div>
        <AccountMenu user={user("LANDLORD")} logoutPending={false} onLogout={vi.fn()} />
        <button>Outside</button>
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: /Nguyễn Văn An/ }));
    const menu = screen.getByRole("menu", { name: "Tài khoản" });
    expect(within(menu).getByRole("menuitem", { name: "Hồ sơ" })).toHaveAttribute("href", "/landlord/profile");
    expect(within(menu).getByRole("menuitem", { name: "Không gian cho thuê" })).toHaveAttribute("href", "/landlord");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not invent an admin profile destination", () => {
    render(<AccountMenu user={user("ADMIN")} logoutPending={false} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Nguyễn Văn An/ }));
    const menu = screen.getByRole("menu", { name: "Tài khoản" });
    expect(within(menu).queryByRole("link")).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("keeps tenant personal utilities in the account menu", () => {
    render(<AccountMenu user={user("TENANT")} logoutPending={false} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Nguyễn Văn An/ }));
    const menu = screen.getByRole("menu", { name: "Tài khoản" });

    expect(within(menu).getByRole("menuitem", { name: "Yêu thích" })).toHaveAttribute("href", "/favorites");
    expect(within(menu).getByRole("menuitem", { name: "Đã xem gần đây" })).toHaveAttribute("href", "/recently-viewed");
    expect(within(menu).getByRole("menuitem", { name: "Tìm kiếm đã lưu" })).toHaveAttribute("href", "/saved-searches");
    expect(within(menu).getByRole("menuitem", { name: "So sánh tin" })).toHaveAttribute("href", "/compare");
  });
});
