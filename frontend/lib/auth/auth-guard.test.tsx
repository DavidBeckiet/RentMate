import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile, UserRole } from "../../types/api";
import { ApiError } from "../api/transport";
import type { AuthContextValue } from "./auth-provider";

const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("./auth-provider", () => ({ useAuth: useAuthMock }));

import { AuthGuard } from "./auth-guard";

const refresh = vi.fn<() => Promise<void>>();
const logout = vi.fn<() => Promise<void>>();

function profile(role: UserRole): UserProfile {
  return {
    id: 1,
    displayName: null,
    role,
    email: `${role.toLowerCase()}@example.com`,
    phone: null,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function authValue(value: Partial<AuthContextValue>): AuthContextValue {
  return { status: "anonymous", user: null, error: null, refresh, logout, ...value };
}

describe("AuthGuard", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it.each([
    ["loading", authValue({ status: "loading" }), "Đang tải"],
    ["anonymous", authValue({ status: "anonymous" }), "Cần đăng nhập"],
    [
      "error",
      authValue({
        status: "error",
        error: new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Safe", category: "backend" })
      }),
      "Có lỗi"
    ]
  ])("renders the controlled %s fallback", (_label, value, fallback) => {
    useAuthMock.mockReturnValue(value);
    render(
      <AuthGuard
        loadingFallback={<p>Đang tải</p>}
        anonymousFallback={<p>Cần đăng nhập</p>}
        errorFallback={<p>Có lỗi</p>}
      >
        Nội dung riêng
      </AuthGuard>
    );

    expect(screen.getByText(fallback)).toBeInTheDocument();
    expect(screen.queryByText("Nội dung riêng")).not.toBeInTheDocument();
  });

  it.each<UserRole>(["TENANT", "LANDLORD", "ADMIN"])("renders content for an allowed %s", (role) => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: profile(role) }));
    render(<AuthGuard allowedRoles={[role]}>Nội dung riêng</AuthGuard>);

    expect(screen.getByText("Nội dung riêng")).toBeInTheDocument();
  });

  it("renders a controlled wrong-role fallback without redirecting", () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: profile("TENANT") }));
    render(
      <AuthGuard allowedRoles={["ADMIN"]} forbiddenFallback={<p>Không đủ quyền</p>}>
        Nội dung quản trị
      </AuthGuard>
    );

    expect(screen.getByText("Không đủ quyền")).toBeInTheDocument();
    expect(screen.queryByText("Nội dung quản trị")).not.toBeInTheDocument();
  });
});
