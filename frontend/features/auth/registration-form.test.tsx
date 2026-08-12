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
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};
const landlord: UserProfile = { ...tenant, id: 2, role: "LANDLORD", email: "owner@example.com", phone: "+84901234567" };

function fillCommon(email = "  TENANT@Example.COM ", password = "  pass word  ") {
  fireEvent.change(screen.getByLabelText("Email (bắt buộc)"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Mật khẩu (bắt buộc)"), { target: { value: password } });
}

describe("RegistrationForm", () => {
  beforeEach(() => {
    apiMocks.registerTenant.mockReset();
    apiMocks.registerLandlord.mockReset();
    authMocks.refresh.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("submits normalized tenant data while omitting a blank optional phone", async () => {
    apiMocks.registerTenant.mockResolvedValue(tenant);
    authMocks.refresh.mockResolvedValue();
    render(<RegistrationForm mode="tenant" />);

    expect(screen.getByLabelText("Số điện thoại (không bắt buộc)")).not.toBeRequired();
    fillCommon();
    fireEvent.change(screen.getByLabelText("Số điện thoại (không bắt buộc)"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    await waitFor(() => expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1));
    expect(apiMocks.registerTenant).toHaveBeenCalledWith({
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

    fireEvent.change(phone, { target: { value: " +84901234567 " } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký cho thuê" }));
    await waitFor(() => expect(apiMocks.registerLandlord).toHaveBeenCalledTimes(1));
    const body = apiMocks.registerLandlord.mock.calls[0]?.[0];
    expect(body).toEqual({ email: "owner@example.com", password: "password", phone: "+84901234567" });
    expect(body).not.toHaveProperty("role");
    expect(apiMocks.registerTenant).not.toHaveBeenCalled();
    expect(authMocks.refresh).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/");
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
    fireEvent.change(screen.getByLabelText("Số điện thoại (không bắt buộc)"), { target: { value: "+84901234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng ký tìm phòng" }));

    expect(await screen.findByText("Phone is invalid.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số điện thoại (không bắt buộc)"), { target: { value: "+84901111111" } });
    expect(screen.queryByText("Phone is invalid.")).not.toBeInTheDocument();
    expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1);
  });

  it("keeps duplicate email at form level and offers a login recovery link", async () => {
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
    expect(alert).toHaveTextContent("Email này đã được đăng ký.");
    expect(screen.getByRole("link", { name: "Đi đến trang đăng nhập" })).toHaveAttribute("href", "/login");
    expect(screen.getByLabelText("Email (bắt buộc)")).not.toHaveAttribute("aria-invalid", "true");
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
    expect(await screen.findByRole("button", { name: "Đang đăng ký…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Đang đăng ký…" }));
    expect(apiMocks.registerTenant).toHaveBeenCalledTimes(1);

    resolveRegistration(tenant);
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/"));
  });
});
