import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleLandlordCompletionBody, UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";

const apiMocks = vi.hoisted(() => ({
  completeGoogleLandlord: vi.fn<(body: GoogleLandlordCompletionBody) => Promise<UserProfile>>()
}));
const authMocks = vi.hoisted(() => ({ refresh: vi.fn<() => Promise<void>>() }));
const navigationMocks = vi.hoisted(() => ({ replace: vi.fn<(path: string) => void>() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { auth: { completeGoogleLandlord: apiMocks.completeGoogleLandlord } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: () => ({ refresh: authMocks.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: navigationMocks.replace }) }));

import { GoogleLandlordCompletionForm } from "./google-landlord-completion-form";

const landlord: UserProfile = {
  id: 2,
  displayName: "Landlord",
  role: "LANDLORD",
  email: "owner@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

describe("GoogleLandlordCompletionForm", () => {
  beforeEach(() => {
    apiMocks.completeGoogleLandlord.mockReset();
    authMocks.refresh.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("validates the phone in the completion step and creates the landlord session", async () => {
    apiMocks.completeGoogleLandlord.mockResolvedValue(landlord);
    authMocks.refresh.mockResolvedValue();
    render(<GoogleLandlordCompletionForm />);

    const phone = screen.getByLabelText("Số điện thoại (bắt buộc)");
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất đăng ký" }));
    expect(await screen.findByText("Vui lòng nhập số điện thoại.")).toBeInTheDocument();
    expect(apiMocks.completeGoogleLandlord).not.toHaveBeenCalled();

    fireEvent.change(phone, { target: { value: "0912345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất đăng ký" }));
    await waitFor(() => expect(apiMocks.completeGoogleLandlord).toHaveBeenCalledWith({ phone: "+84912345678" }));
    expect(authMocks.refresh).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/landlord");
  });

  it("offers a safe restart when the one-time onboarding ticket is gone", async () => {
    apiMocks.completeGoogleLandlord.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "GOOGLE_ONBOARDING_REQUIRED",
        message: "Expired",
        requestId: "req-onboarding",
        category: "backend"
      })
    );
    render(<GoogleLandlordCompletionForm />);
    fireEvent.change(screen.getByLabelText("Số điện thoại (bắt buộc)"), { target: { value: "+84901234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất đăng ký" }));

    expect(
      await screen.findByText("Phiên đăng ký Google đã hết hạn hoặc đã được sử dụng. Hãy bắt đầu lại.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu lại bằng Google" })).toHaveAttribute("href", "/register/landlord");
  });
});
