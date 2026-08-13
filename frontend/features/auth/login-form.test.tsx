import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginBody, UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";

const apiMocks = vi.hoisted(() => ({ login: vi.fn<(body: LoginBody) => Promise<UserProfile>>() }));
const authMocks = vi.hoisted(() => ({ refresh: vi.fn<() => Promise<void>>() }));
const navigationMocks = vi.hoisted(() => ({ replace: vi.fn<(path: string) => void>() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { auth: { login: apiMocks.login } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: () => ({ refresh: authMocks.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: navigationMocks.replace }) }));

import { LoginForm } from "./login-form";

const admin: UserProfile = {
  id: 7,
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function fillLogin(email = " ADMIN@Example.COM ", password = "  pass word  ") {
  fireEvent.change(screen.getByLabelText("Email (bắt buộc)"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Mật khẩu (bắt buộc)"), { target: { value: password } });
}

describe("LoginForm", () => {
  beforeEach(() => {
    apiMocks.login.mockReset();
    authMocks.refresh.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("uses email/password only, preserves password, accepts ADMIN, refreshes, and navigates home", async () => {
    apiMocks.login.mockResolvedValue(admin);
    authMocks.refresh.mockResolvedValue();
    render(<LoginForm />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vai trò/i)).not.toBeInTheDocument();
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(apiMocks.login).toHaveBeenCalledTimes(1));
    expect(apiMocks.login).toHaveBeenCalledWith({ email: "admin@example.com", password: "  pass word  " });
    expect(authMocks.refresh).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/");
  });

  it("enforces the optional admin entry role after login without changing the shared default", async () => {
    apiMocks.login.mockResolvedValue({ ...admin, role: "TENANT" });
    authMocks.refresh.mockResolvedValue();
    render(<LoginForm requiredRole="ADMIN" successDestination="/admin" />);
    fillLogin("tenant@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trang này dành cho quản trị viên.");
    expect(authMocks.refresh).toHaveBeenCalledOnce();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("keeps INVALID_CREDENTIALS generic and form-level", async () => {
    apiMocks.login.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "The email or password is incorrect.",
        requestId: "req-credentials",
        category: "backend"
      })
    );
    render(<LoginForm />);
    fillLogin("unknown@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Email hoặc mật khẩu không đúng.");
    expect(alert).not.toHaveTextContent(/email không tồn tại|sai mật khẩu|tài khoản bị khóa|inactive/i);
    expect(screen.getByLabelText("Email (bắt buộc)")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Mật khẩu (bắt buộc)")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("maps backend validation details to allowed login fields", async () => {
    apiMocks.login.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Invalid",
        details: [{ field: "email", code: "INVALID_VALUE", message: "Email needs review." }],
        category: "backend"
      })
    );
    render(<LoginForm />);
    fillLogin("user@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Email needs review.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email (bắt buộc)")).toHaveAttribute("aria-invalid", "true");
  });

  it.each([
    [
      "rate limit",
      new ApiError({
        status: 429,
        code: "RATE_LIMITED",
        message: "Limited",
        requestId: "req-rate",
        category: "backend"
      }),
      "thử đăng nhập quá nhiều lần"
    ],
    [
      "network",
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "Network", category: "network" }),
      "Không thể kết nối đến máy chủ"
    ],
    [
      "server",
      new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "Private stack", category: "backend" }),
      "Không thể đăng nhập lúc này"
    ]
  ])("renders a safe %s error without automatic retry", async (_label, error, message) => {
    apiMocks.login.mockRejectedValue(error);
    render(<LoginForm />);
    fillLogin("user@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("Private stack")).not.toBeInTheDocument();
    expect(apiMocks.login).toHaveBeenCalledTimes(1);
    expect(authMocks.refresh).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("blocks duplicate login while the first request is pending", async () => {
    let resolveLogin: (profile: UserProfile) => void = () => undefined;
    apiMocks.login.mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveLogin = resolve;
      })
    );
    authMocks.refresh.mockResolvedValue();
    render(<LoginForm />);
    fillLogin("admin@example.com", "password");

    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Đang đăng nhập…" }));
    expect(apiMocks.login).toHaveBeenCalledTimes(1);

    resolveLogin(admin);
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/"));
  });
});
