import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const apiMocks = vi.hoisted(() => ({ getContactVerificationStatus: vi.fn(), submitVerification: vi.fn() }));
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
});
