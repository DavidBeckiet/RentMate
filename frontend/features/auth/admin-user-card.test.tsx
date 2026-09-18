import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UserProfile } from "../../types/api";
import { AdminUserCard } from "./admin-user-card";

const user: UserProfile = {
  id: 42,
  displayName: "Minh Anh",
  role: "LANDLORD",
  email: "minh@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

describe("AdminUserCard", () => {
  it("renders a compact identity row that opens detail without list-level account actions", () => {
    render(<AdminUserCard user={user} href="/admin/users/42?q=minh&page=2" />);

    expect(screen.getByRole("link", { name: "Xem tài khoản Minh Anh" })).toHaveAttribute(
      "href",
      "/admin/users/42?q=minh&page=2"
    );
    expect(screen.getByText("minh@example.com")).toBeInTheDocument();
    expect(screen.getByText("Người cho thuê")).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
    expect(screen.getByText("ID #42")).toBeInTheDocument();
    expect(screen.queryByText("+84901234567")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
