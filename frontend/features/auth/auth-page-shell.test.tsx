import { render, screen, waitFor } from "@testing-library/react";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigationMocks = vi.hoisted(() => ({ replace: vi.fn<(path: string) => void>() }));

vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: navigationMocks.replace }) }));

import { AuthPageShell } from "./auth-page-shell";

const refresh = vi.fn<() => Promise<void>>();
const logout = vi.fn<() => Promise<void>>();
const tenant: UserProfile = {
  id: 1,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(value: Partial<AuthContextValue>): AuthContextValue {
  return { status: "anonymous", user: null, error: null, refresh, logout, ...value };
}

function renderShell() {
  return render(
    <AuthPageShell
      title="Đăng nhập"
      description="Dùng tài khoản RentMate của bạn."
      footer={<Link href="/register/tenant">Đăng ký tìm phòng</Link>}
    >
      <form aria-label="Biểu mẫu đăng nhập">
        <button type="submit">Đăng nhập</button>
      </form>
    </AuthPageShell>
  );
}

describe("AuthPageShell", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("renders one semantic single-column auth purpose with secondary navigation for anonymous users", () => {
    useAuthMock.mockReturnValue(authValue({ status: "anonymous" }));
    renderShell();

    const heading = screen.getByRole("heading", { level: 1, name: "Đăng nhập" });
    expect(heading).toBeInTheDocument();
    expect(heading.closest("section")).toHaveClass("max-w-md");
    expect(screen.getByRole("form", { name: "Biểu mẫu đăng nhập" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng ký tìm phòng" })).toHaveAttribute("href", "/register/tenant");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("shows loading state without form flicker during auth bootstrap", () => {
    useAuthMock.mockReturnValue(authValue({ status: "loading" }));
    renderShell();

    expect(screen.getByRole("status")).toHaveTextContent("Đang kiểm tra tài khoản…");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("redirects an authenticated user home without rendering the form", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    renderShell();

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đang chuyển hướng…");
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/"));
  });

  it("supports an admin-only entry mode and gives a wrong-role account safe guidance", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    render(
      <AuthPageShell
        title="Đăng nhập quản trị"
        description="Quản trị"
        footer={null}
        requiredRole="ADMIN"
        successDestination="/admin"
        wrongRoleMessage="Trang này dành cho quản trị viên."
      >
        <form aria-label="Đăng nhập quản trị" />
      </AuthPageShell>
    );
    expect(screen.getByText("Trang này dành cho quản trị viên.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the recovery form available when auth bootstrap fails", () => {
    useAuthMock.mockReturnValue(
      authValue({
        status: "error",
        error: new ApiError({ status: null, code: "NETWORK_ERROR", message: "Safe", category: "network" })
      })
    );
    renderShell();

    expect(screen.getByRole("form", { name: "Biểu mẫu đăng nhập" })).toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });
});
