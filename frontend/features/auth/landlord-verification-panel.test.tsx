import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const apiMocks = vi.hoisted(() => ({ getCurrentVerification: vi.fn(), submitVerification: vi.fn() }));
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
    apiMocks.getCurrentVerification.mockReset();
    apiMocks.submitVerification.mockReset();
    apiMocks.getCurrentVerification.mockResolvedValue(null);
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
    apiMocks.getCurrentVerification.mockResolvedValue({
      id: 1,
      displayName: "Nguyễn Văn An",
      requestNote: null,
      status: "APPROVED",
      decisionNote: "Đã đối chiếu.",
      submittedAt: "2026-08-23T00:00:00.000Z",
      reviewedAt: "2026-08-23T01:00:00.000Z"
    });
    render(<LandlordVerificationPanel />);
    expect(await screen.findByText("Đã xác minh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gửi/ })).not.toBeInTheDocument();
  });
});
