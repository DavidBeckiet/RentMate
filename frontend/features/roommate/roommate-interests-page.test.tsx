import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateInterest, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({
  listMine: vi.fn(),
  listIncoming: vi.fn(),
  listInterests: vi.fn(),
  acceptInterest: vi.fn(),
  rejectInterest: vi.fn(),
  withdrawInterest: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/roommates/interests",
  useRouter: () => routerMocks,
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RoommateInterestsPage } from "./roommate-interests-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateInterestsPage", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    useAuthMock.mockReturnValue(auth());
    routerMocks.push.mockReset();
    const request = roommateRequest();
    apiMocks.listMine.mockResolvedValue({ data: [request], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    apiMocks.listIncoming.mockResolvedValue({
      data: [roommateInterest({ request })],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.listInterests.mockResolvedValue({
      data: [roommateInterest()],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });

  it("shows the full safety warning and checklist before accept, then maps the candidate-open conflict", async () => {
    apiMocks.acceptInterest.mockRejectedValue(
      new ApiError({ status: 409, code: "ROOMMATE_CANDIDATE_OPEN_REQUEST", message: "private", category: "backend" })
    );
    render(<RoommateInterestsPage />);

    expect(await screen.findByRole("button", { name: "Chấp nhận" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chấp nhận" }));
    expect(screen.getByText("Hai bạn sẽ có một kết nối tìm roommate hiện tại.")).toBeInTheDocument();
    expect(screen.getByText(/không phải đặt chỗ, phê duyệt của chủ nhà hoặc bảo đảm thuê nhà/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Xác nhận listing và điều kiện thuê với người cho thuê.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chấp nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Người này cần đóng yêu cầu tìm người ở ghép của họ trước khi có thể kết nối."
    );
    expect(apiMocks.acceptInterest).toHaveBeenCalledWith(91);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "roommate-tab-incoming");
  });

  it("lets a request owner reject an incoming pending interest", async () => {
    apiMocks.rejectInterest.mockResolvedValue(roommateInterest({ status: "REJECTED" }));
    render(<RoommateInterestsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Từ chối" }));
    await waitFor(() => expect(apiMocks.rejectInterest).toHaveBeenCalledWith(91));
  });

  it("lets an interested tenant withdraw an outgoing pending interest", async () => {
    apiMocks.listInterests.mockResolvedValue({
      data: [roommateInterest({ direction: "OUTGOING" })],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.withdrawInterest.mockResolvedValue(roommateInterest({ direction: "OUTGOING", status: "WITHDRAWN" }));
    render(<RoommateInterestsPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "Đã gửi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rút lời quan tâm" }));
    await waitFor(() => expect(apiMocks.withdrawInterest).toHaveBeenCalledWith(91));
  });

  it("shows incoming terminal history without requiring an open request", async () => {
    apiMocks.listInterests.mockResolvedValue({
      data: [roommateInterest({ status: "REJECTED" })],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });

    render(<RoommateInterestsPage />);

    expect(await screen.findByRole("heading", { name: /từ chối/iu })).toBeInTheDocument();
    expect(apiMocks.listInterests).toHaveBeenCalledWith(
      { direction: "INCOMING", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );
    expect(apiMocks.listMine).not.toHaveBeenCalled();
  });
});
