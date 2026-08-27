import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateInterest, roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  listMine: vi.fn(),
  getProfile: vi.fn(),
  createInterest: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates/requests/42", useRouter: () => routerMocks }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { RoommateRequestDetailPage } from "./roommate-request-detail-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

function emptyPage() {
  return { data: [], pagination: { page: 1, pageSize: 50, hasNextPage: false } };
}

describe("RoommateRequestDetailPage", () => {
  beforeEach(() => {
    apiMocks.getRequest.mockReset();
    apiMocks.listMine.mockReset();
    apiMocks.getProfile.mockReset();
    apiMocks.createInterest.mockReset();
    routerMocks.push.mockReset();
    useAuthMock.mockReturnValue(auth());
    apiMocks.listMine.mockResolvedValue(emptyPage());
    apiMocks.getProfile.mockResolvedValue(roommateProfile());
  });

  it("renders public-safe request context, the required warning, checklist, and an interest composer", async () => {
    apiMocks.getRequest.mockResolvedValue(roommateRequest());
    apiMocks.createInterest.mockResolvedValue(roommateInterest({ id: 91, direction: "OUTGOING" }));
    render(<RoommateRequestDetailPage requestId="42" />);

    expect(await screen.findByRole("heading", { name: "Chi tiết yêu cầu ở ghép" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Báo cáo và ngừng tương tác nếu thấy hành vi đáng ngờ.")).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/106\.682|10\.782/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Lời nhắn mở đầu (bắt buộc)"), {
      target: { value: "Mình muốn trao đổi thêm về nhu cầu ở ghép." }
    });
    expect(
      screen.getByText(`${Array.from("Mình muốn trao đổi thêm về nhu cầu ở ghép.").length}/2000 ký tự`)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi lời quan tâm" }));
    await waitFor(() =>
      expect(apiMocks.createInterest).toHaveBeenCalledWith(42, "Mình muốn trao đổi thêm về nhu cầu ở ghép.")
    );
    expect(routerMocks.push).toHaveBeenCalledWith("/roommates/conversations/91");
  });

  it("does not offer a new interest when a linked request is no longer available", async () => {
    apiMocks.getRequest.mockResolvedValue(
      roommateRequest({
        listingId: 23,
        listingMode: "LINKED",
        signals: { profileCompleted: true, requestOpen: true, listingCurrentlyAvailable: false }
      })
    );
    render(<RoommateRequestDetailPage requestId="42" />);
    expect(await screen.findByText("Listing không còn khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi lời quan tâm" })).not.toBeInTheDocument();
  });

  it("guides a tenant without a roommate profile before posting an interest", async () => {
    apiMocks.getRequest.mockResolvedValue(roommateRequest());
    apiMocks.getProfile.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    render(<RoommateRequestDetailPage requestId="42" />);

    expect(
      await screen.findByRole("heading", { name: "Hoàn thành hồ sơ trước khi gửi lời quan tâm" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết lập hồ sơ ở ghép" })).toHaveAttribute(
      "href",
      "/roommates/profile?next=/roommates/requests/42"
    );
    expect(screen.queryByRole("button", { name: "Gửi lời quan tâm" })).not.toBeInTheDocument();
    expect(apiMocks.createInterest).not.toHaveBeenCalled();
  });
});
