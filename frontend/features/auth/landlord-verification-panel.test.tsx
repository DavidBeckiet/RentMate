import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const apiMocks = vi.hoisted(() => ({
  getContactVerificationStatus: vi.fn(),
  requestEmailVerification: vi.fn(),
  submitVerification: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { users: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { LandlordVerificationPanel } from "./landlord-verification-panel";

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: 7,
    displayName: null,
    role: "LANDLORD",
    email: "owner@example.com",
    phone: "+84901234567",
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  },
  error: null,
  refresh: vi.fn(),
  logout: vi.fn()
};

describe("LandlordVerificationPanel", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(auth);
    apiMocks.getContactVerificationStatus.mockReset();
    apiMocks.requestEmailVerification.mockReset();
    apiMocks.submitVerification.mockReset();
    apiMocks.getContactVerificationStatus.mockResolvedValue({
      email: { address: "owner@example.com", verified: true, verifiedAt: "2026-08-23T00:00:00.000Z" },
      phone: { number: "+84901234567", verified: true, verifiedAt: "2026-08-23T00:00:00.000Z" },
      profile: null
    });
  });

  it("submits a bounded manual profile review request", async () => {
    apiMocks.submitVerification.mockResolvedValue({
      id: 1,
      displayName: "Nguyễn Văn An",
      requestNote: null,
      status: "PENDING",
      decisionNote: null,
      submittedAt: "2026-08-23T00:00:00.000Z",
      reviewedAt: null
    });
    render(<LandlordVerificationPanel />);
    fireEvent.change(await screen.findByLabelText("Tên trong hồ sơ xác minh"), { target: { value: "Nguyễn Văn An" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu xác minh" }));
    await waitFor(() =>
      expect(apiMocks.submitVerification).toHaveBeenCalledWith({ displayName: "Nguyễn Văn An", note: null })
    );
    expect(await screen.findByText("Đang chờ duyệt")).toBeInTheDocument();
  });

  it("shows the approved state without exposing internal decision actors", async () => {
    apiMocks.getContactVerificationStatus.mockResolvedValue({
      email: { address: "owner@example.com", verified: true, verifiedAt: "2026-08-23T00:00:00.000Z" },
      phone: { number: "+84901234567", verified: true, verifiedAt: "2026-08-23T00:00:00.000Z" },
      profile: {
        id: 1,
        displayName: "Nguyễn Văn An",
        requestNote: null,
        status: "APPROVED",
        decisionNote: "Đã đối chiếu.",
        submittedAt: "2026-08-23T00:00:00.000Z",
        reviewedAt: "2026-08-23T01:00:00.000Z"
      }
    });
    render(<LandlordVerificationPanel />);
    expect((await screen.findAllByText(/\u0110\u00e3 x\u00e1c minh/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Gửi/ })).not.toBeInTheDocument();
  });

  it("allows email OTP resend through the existing verification request", async () => {
    const status = {
      email: { address: "owner@example.com", verified: false, verifiedAt: null },
      phone: { number: "+84901234567", verified: true, verifiedAt: "2026-08-23T00:00:00.000Z" },
      profile: null
    };
    apiMocks.getContactVerificationStatus.mockResolvedValue(status);
    apiMocks.requestEmailVerification.mockResolvedValue(status);
    render(<LandlordVerificationPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Gửi mã email" }));
    await waitFor(() => expect(apiMocks.requestEmailVerification).toHaveBeenCalledTimes(1));
    const code = screen.getByLabelText("Mã OTP email 6 số");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("pattern", "[0-9]{6}");
    fireEvent.change(code, { target: { value: "654321" } });

    fireEvent.click(screen.getByRole("button", { name: "Gửi lại mã email" }));
    await waitFor(() => expect(apiMocks.requestEmailVerification).toHaveBeenCalledTimes(2));
    expect(code).toHaveValue("");
  });
});
