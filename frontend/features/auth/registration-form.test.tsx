import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LandlordRegistrationBody, TenantRegistrationBody, UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";

const apiMocks = vi.hoisted(() => ({
  registerTenant: vi.fn<(body: TenantRegistrationBody) => Promise<UserProfile>>(),
  registerLandlord: vi.fn<(body: LandlordRegistrationBody) => Promise<UserProfile>>()
}));
const authMocks = vi.hoisted(() => ({ refresh: vi.fn<() => Promise<void>>() }));
const navigationMocks = vi.hoisted(() => ({ replace: vi.fn<(path: string) => void>() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: { auth: { registerTenant: apiMocks.registerTenant, registerLandlord: apiMocks.registerLandlord } }
  };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: () => ({ refresh: authMocks.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: navigationMocks.replace }) }));

import { RegistrationForm } from "./registration-form";

const tenant: UserProfile = {
  id: 1,
  displayName: null,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};
const landlord: UserProfile = { ...tenant, id: 2, role: "LANDLORD", email: "owner@example.com", phone: "+84901234567" };

function fillCommon(email = "  TENANT@Example.COM ", password = "  pass word  ") {
  fireEvent.change(screen.getByLabelText("Họ và tên (bắt buộc)"), { target: { value: "  Nguyễn Văn An  " } });
  fireEvent.change(screen.getByLabelText("Email (bắt buộc)"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Mật khẩu (bắt buộc)"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu (bắt buộc)"), { target: { value: password } });
}

describe("RegistrationForm", () => {
  beforeEach(() => {
    apiMocks.registerTenant.mockReset();
    apiMocks.registerLandlord.mockReset();
    authMocks.refresh.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("requires a human-friendly name and avoids technical validation language", () => {
    render(<RegistrationForm mode="tenant" />);
    const name = screen.getByLabelText("Họ và tên (bắt buộc)");
    expect(name).toBeRequired();
    expect(name).toHaveAttribute("placeholder", "Nguyễn Văn A");
    expect(name).toHaveValue("");
    expect(screen.getByText("Tối thiểu 8 ký tự.")).toBeInTheDocument();
    expect(screen.getByText("Không bắt buộc")).toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại")).toHaveAttribute("placeholder", "0912345678");
    for (const indicator of screen.getAllByText("(bắt buộc)")) expect(indicator).toHaveClass("sr-only");
    expect(document.body).not.toHaveTextContent(/displayName|E\.164|UTF-8|72 byte/);
    expect(document.body).not.toHaveTextContent(/\+849/);
  });

  it.each(["tenant", "landlord"] as const)("renders a disabled Google seam for %s until configured", (mode) => {
    render(<RegistrationForm mode={mode} />);

    const google = screen.getByRole("button", { name: "Tiếp tục với Google" });
    expect(google).toBeDisabled();
    expect(screen.getByText("Google chưa được cấu hình.")).toBeInTheDocument();
    fireEvent.click(google);
    expect(apiMocks.registerTenant).not.toHaveBeenCalled();
    expect(apiMocks.registerLandlord).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("submits normalized tenant data while omitting a blank optional phone", async () => {
    apiMocks.registerTenant.mockResolvedValue(tenant);
    authMocks.refresh.mockResolvedValue();
    render(<RegistrationForm mode="tenant" />);

    expect(screen.getByLabelText("Số điện thoại")).not.toBeRequired();
    fillCommon();
    fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    await waitFor(() => expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1));
    expect(apiMocks.registerTenant).toHaveBeenCalledWith({
      displayName: "Nguyễn Văn An",
      email: "tenant@example.com",
      password: "  pass word  "
    });
    expect(apiMocks.registerLandlord).not.toHaveBeenCalled();
    expect(authMocks.refresh).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/");
  });

  it("requires a landlord phone and submits only the landlord endpoint with no role field", async () => {
    apiMocks.registerLandlord.mockResolvedValue(landlord);
    authMocks.refresh.mockResolvedValue();
    render(<RegistrationForm mode="landlord" />);
    fillCommon(" OWNER@Example.COM ", "password");

    const phone = screen.getByLabelText("Số điện thoại (bắt buộc)");
    expect(phone).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký cho thuê" }));
    expect(await screen.findByText("Vui lòng nhập số điện thoại.")).toBeInTheDocument();
    expect(apiMocks.registerLandlord).not.toHaveBeenCalled();

    fireEvent.change(phone, { target: { value: " 0912345678 " } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký cho thuê" }));
    await waitFor(() => expect(apiMocks.registerLandlord).toHaveBeenCalledTimes(1));
    const body = apiMocks.registerLandlord.mock.calls[0]?.[0];
    expect(body).toEqual({
      displayName: "Nguyễn Văn An",
      email: "owner@example.com",
      password: "password",
      phone: "+84912345678"
    });
    expect(body).not.toHaveProperty("role");
    expect(apiMocks.registerTenant).not.toHaveBeenCalled();
    expect(authMocks.refresh).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/landlord");
  });

  it("maps backend validation details and clears the relevant error after correction", async () => {
    apiMocks.registerTenant.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "The request contains invalid data.",
        requestId: "req-field",
        details: [{ field: "phone", code: "INVALID_VALUE", message: "Phone is invalid." }],
        category: "backend"
      })
    );
    render(<RegistrationForm mode="tenant" />);
    fillCommon("tenant@example.com", "password");
    fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: "+84901234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    expect(await screen.findByText("Số điện thoại chưa đúng. Vui lòng kiểm tra lại.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: "+84901111111" } });
    expect(screen.queryByText("Số điện thoại chưa đúng. Vui lòng kiểm tra lại.")).not.toBeInTheDocument();
    expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1);
  });

  it("never renders a raw backend validation fallback", async () => {
    apiMocks.registerTenant.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "Invalid payload at users.create",
        category: "backend"
      })
    );
    render(<RegistrationForm mode="tenant" />);
    fillCommon("tenant@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tạo tài khoản. Vui lòng kiểm tra thông tin và thử lại."
    );
    expect(screen.queryByText("Invalid payload at users.create")).not.toBeInTheDocument();
  });

  it("explains a duplicate email, hides technical IDs, and offers login or email correction", async () => {
    apiMocks.registerTenant.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "EMAIL_ALREADY_EXISTS",
        message: "An account with this email already exists.",
        requestId: "req-duplicate",
        category: "backend"
      })
    );
    render(<RegistrationForm mode="tenant" />);
    fillCommon("tenant@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Email này đã được sử dụng.");
    expect(alert).toHaveTextContent("Bạn có thể đăng nhập bằng tài khoản hiện có hoặc sử dụng email khác.");
    expect(alert).not.toHaveTextContent("req-duplicate");
    expect(alert).not.toHaveTextContent("Mã yêu cầu");
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    fireEvent.click(screen.getByRole("button", { name: "Đổi email" }));
    expect(screen.getByLabelText("Email (bắt buộc)")).toHaveFocus();
    expect(screen.getByLabelText("Email (bắt buộc)")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows email field validation on blur before submit", () => {
    render(<RegistrationForm mode="tenant" />);
    const email = screen.getByLabelText("Email (bắt buộc)");
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);

    expect(screen.getByText("Email không đúng định dạng.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(apiMocks.registerTenant).not.toHaveBeenCalled();
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
      "thử đăng ký quá nhiều lần"
    ],
    [
      "network ambiguity",
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "Network", category: "network" }),
      "Hãy thử đăng nhập trước"
    ],
    [
      "server failure",
      new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "Private stack", category: "backend" }),
      "Không thể đăng ký lúc này"
    ]
  ])("renders a safe %s error without automatically replaying registration", async (_label, error, message) => {
    apiMocks.registerTenant.mockRejectedValue(error);
    render(<RegistrationForm mode="tenant" />);
    fillCommon("tenant@example.com", "password");
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("Private stack")).not.toBeInTheDocument();
    expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1);
    expect(authMocks.refresh).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("blocks duplicate tenant submission while the first request is pending", async () => {
    let resolveRegistration: (profile: UserProfile) => void = () => undefined;
    apiMocks.registerTenant.mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveRegistration = resolve;
      })
    );
    authMocks.refresh.mockResolvedValue();
    render(<RegistrationForm mode="tenant" />);
    fillCommon("tenant@example.com", "password");

    const submit = screen.getByRole("button", { name: "Đăng ký tìm phòng" });
    fireEvent.click(submit);
    const pendingButton = await screen.findByRole("button", { name: "Đang đăng ký…" });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton.closest("form")).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: "Đang đăng ký…" }));
    expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1);

    resolveRegistration(tenant);
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/"));
  });

  it("keeps both accessible password toggles available while switching visibility", () => {
    render(<RegistrationForm mode="tenant" />);

    const password = screen.getByLabelText("Mật khẩu (bắt buộc)");
    const confirmation = screen.getByLabelText("Nhập lại mật khẩu (bắt buộc)");
    const toggles = screen.getAllByRole("button", { name: "Hiện mật khẩu" });
    expect(toggles).toHaveLength(2);
    expect(password).toHaveClass("pl-10", "pr-12");
    expect(confirmation).toHaveClass("pl-10", "pr-12");
    expect(toggles[0]).toHaveClass("min-h-11", "w-11");
    fireEvent.click(toggles[0]!);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ẩn mật khẩu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hiện mật khẩu" })).toBeInTheDocument();
    expect(confirmation).toHaveAttribute("type", "password");
  });

  it("requires matching confirmation and never sends it to the API", async () => {
    apiMocks.registerTenant.mockResolvedValue(tenant);
    authMocks.refresh.mockResolvedValue();
    render(<RegistrationForm mode="tenant" />);

    fillCommon("tenant@example.com", "password");
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu (bắt buộc)"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));
    expect(await screen.findByText("Mật khẩu nhập lại chưa khớp.")).toBeInTheDocument();
    expect(apiMocks.registerTenant).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nhập lại mật khẩu (bắt buộc)")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu (bắt buộc)"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));
    await waitFor(() => expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1));
    expect(apiMocks.registerTenant.mock.calls[0]?.[0]).not.toHaveProperty("confirmPassword");
  });
});
