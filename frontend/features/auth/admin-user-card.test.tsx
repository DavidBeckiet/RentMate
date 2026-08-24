import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminUserCard } from "./admin-user-card";

const base = {
  id: 1,
  displayName: null,
  email: "user@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} as const;

describe("AdminUserCard", () => {
  it("never exposes an activation control for an ADMIN row", () => {
    const user = { ...base, role: "ADMIN" as const };
    render(<AdminUserCard user={user} onActivationRequest={vi.fn()} />);
    expect(screen.getByText("Không thể thay đổi trạng thái tài khoản quản trị.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("requests an inline confirmation for a non-admin row", () => {
    const request = vi.fn();
    const user = { ...base, role: "LANDLORD" as const };
    render(<AdminUserCard user={user} onActivationRequest={request} />);
    fireEvent.click(screen.getByRole("button", { name: "Ngừng hoạt động" }));
    expect(request).toHaveBeenCalledWith(user);
  });
});
