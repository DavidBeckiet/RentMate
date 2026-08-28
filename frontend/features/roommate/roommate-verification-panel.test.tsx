import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { TenantContactVerificationStatus } from "../../types/api";
import { ApiError } from "../../lib/api/client";

const apiMocks = vi.hoisted(() => ({
  getTenantContactVerificationStatus: vi.fn(),
  requestTenantEmailVerification: vi.fn(),
  confirmTenantEmailVerification: vi.fn(),
  requestTenantPhoneVerification: vi.fn(),
  confirmTenantPhoneVerification: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { users: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { RoommateVerificationPanel } from "./roommate-verification-panel";

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: 7,
    displayName: "Tenant",
    role: "TENANT",
    email: "tenant@example.com",
    phone: "+84901234567",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  error: null,
  refresh: vi.fn(),
  logout: vi.fn()
};

function verification(overrides: Partial<TenantContactVerificationStatus> = {}): TenantContactVerificationStatus {
  return {
    email: { address: "tenant@example.com", verified: false, verifiedAt: null, available: true },
    phone: { number: "+84901234567", verified: false, verifiedAt: null, available: true },
    ...overrides
  };
}

describe("RoommateVerificationPanel", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(auth);
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.getTenantContactVerificationStatus.mockResolvedValue(verification());
  });

  it("supports independent email and phone request/confirm flows without rendering timestamps", async () => {
    apiMocks.requestTenantEmailVerification.mockResolvedValue(verification());
    apiMocks.confirmTenantEmailVerification.mockResolvedValue(
      verification({ email: { address: "tenant@example.com", verified: true, verifiedAt: "private", available: true } })
    );
    apiMocks.requestTenantPhoneVerification.mockResolvedValue(verification());

    render(<RoommateVerificationPanel />);
    expect(await screen.findByText("Email chưa xác minh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi mã email" }));
    await waitFor(() => expect(apiMocks.requestTenantEmailVerification).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Mã xác minh trong email"), { target: { value: "email-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận email" }));
    await waitFor(() => expect(apiMocks.confirmTenantEmailVerification).toHaveBeenCalledWith("email-secret"));
    expect(await screen.findByText("Email đã xác minh")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gửi mã OTP" }));
    await waitFor(() => expect(apiMocks.requestTenantPhoneVerification).toHaveBeenCalledOnce());
    expect(apiMocks.confirmTenantPhoneVerification).not.toHaveBeenCalled();
  });

  it("shows provider-unavailable state and sanitized rate-limit errors", async () => {
    apiMocks.getTenantContactVerificationStatus.mockResolvedValue(
      verification({ phone: { number: "+84901234567", verified: false, verifiedAt: null, available: false } })
    );
    render(<RoommateVerificationPanel />);
    expect(
      await screen.findByText("Kênh gửi mã hiện chưa khả dụng. Bạn có thể thử lại sau khi kênh được bật.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi mã OTP" })).not.toBeInTheDocument();

    apiMocks.requestTenantEmailVerification.mockRejectedValue(
      new ApiError({ status: 429, code: "RATE_LIMITED", message: "private backend detail", category: "backend" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Gửi mã email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bạn thao tác quá nhiều lần.");
    expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
  });

  it("keeps an already verified channel factual and action-free", async () => {
    apiMocks.getTenantContactVerificationStatus.mockResolvedValue(
      verification({ email: { address: "tenant@example.com", verified: true, verifiedAt: "private", available: true } })
    );
    render(<RoommateVerificationPanel />);
    expect(await screen.findByText("Email đã xác minh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gửi mã email/ })).not.toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("exposes a retry action when the verification status dependency fails", async () => {
    apiMocks.getTenantContactVerificationStatus.mockRejectedValueOnce(
      new ApiError({ status: 503, code: "DEPENDENCY_UNAVAILABLE", message: "private", category: "backend" })
    );
    render(<RoommateVerificationPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Kênh gửi mã email hiện chưa khả dụng");
    apiMocks.getTenantContactVerificationStatus.mockResolvedValueOnce(verification());
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Email chưa xác minh")).toBeInTheDocument();
  });
});
