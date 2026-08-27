import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { tenantUser, roommateProfile } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ getProfile: vi.fn(), upsertProfile: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/roommates/profile",
  useRouter: () => routerMocks,
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RoommateProfilePage } from "./roommate-profile-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateProfilePage", () => {
  beforeEach(() => {
    apiMocks.getProfile.mockReset();
    apiMocks.upsertProfile.mockReset();
    routerMocks.push.mockReset();
    useAuthMock.mockReturnValue(auth());
  });

  it("lets a tenant create a complete profile after a missing-profile response", async () => {
    apiMocks.getProfile.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    apiMocks.upsertProfile.mockResolvedValue(roommateProfile());

    render(<RoommateProfilePage />);
    const intro = await screen.findByLabelText(/Giới thiệu ngắn/);
    fireEvent.change(intro, {
      target: { value: "Mình ưu tiên không gian gọn gàng, tôn trọng giờ nghỉ và trao đổi rõ ràng." }
    });
    expect(
      screen.getByText(
        `${Array.from("Mình ưu tiên không gian gọn gàng, tôn trọng giờ nghỉ và trao đổi rõ ràng.").length}/500 ký tự`
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ ở ghép" }));

    await waitFor(() =>
      expect(apiMocks.upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ intro: "Mình ưu tiên không gian gọn gàng, tôn trọng giờ nghỉ và trao đổi rõ ràng." })
      )
    );
    expect(await screen.findByText("Hồ sơ ở ghép đã được lưu.")).toBeInTheDocument();
  });

  it("shows a neutral incomplete state and validates the minimum intro length before saving", async () => {
    apiMocks.getProfile.mockResolvedValue(roommateProfile({ profileCompleted: false }));
    render(<RoommateProfilePage />);

    expect(await screen.findByText(/Hồ sơ chưa sẵn sàng để dùng cho các tương tác ở ghép/i)).toBeInTheDocument();
    const intro = screen.getByLabelText(/Giới thiệu ngắn/);
    fireEvent.change(intro, { target: { value: "Ngắn" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ ở ghép" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Phần giới thiệu cần có ít nhất 20 ký tự.");
    expect(intro).toHaveAttribute("aria-invalid", "true");
    expect(apiMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("updates an existing profile and refreshes its completeness signal from the API", async () => {
    apiMocks.getProfile.mockResolvedValue(roommateProfile({ intro: "Nội dung hồ sơ cũ để chỉnh sửa cho đủ độ dài." }));
    apiMocks.upsertProfile.mockResolvedValue(roommateProfile({ profileCompleted: true }));
    render(<RoommateProfilePage />);

    const intro = await screen.findByLabelText(/Giới thiệu ngắn/);
    fireEvent.change(intro, {
      target: { value: "Mình đã cập nhật phần giới thiệu để phản ánh nhu cầu sinh hoạt hiện tại." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ ở ghép" }));

    await waitFor(() => expect(apiMocks.upsertProfile).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Hồ sơ ở ghép đã hoàn thành.")).toBeInTheDocument();
  });

  it("does not call the roommate profile API for an anonymous visitor", () => {
    useAuthMock.mockReturnValue(auth({ status: "anonymous", user: null }));
    render(<RoommateProfilePage />);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(apiMocks.getProfile).not.toHaveBeenCalled();
  });
});
