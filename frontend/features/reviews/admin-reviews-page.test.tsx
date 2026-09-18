import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingReview } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listReviews: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const useSearchParamsMock = vi.hoisted(() => vi.fn<() => URLSearchParams>());
const routerMock = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: useSearchParamsMock
}));

import { AdminReviewsPage } from "./admin-reviews-page";

const review: AdminListingReview = {
  id: 9,
  inquiryId: 7,
  listingId: 42,
  tenantId: 11,
  overallRating: 5,
  accuracyRating: 4,
  responsivenessRating: 5,
  comment: "Thông tin đúng thực tế và chủ trọ phản hồi nhanh.",
  status: "PENDING",
  moderationNote: null,
  reviewedByAdminId: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null
};

const admin = {
  id: 1,
  displayName: null,
  role: "ADMIN" as const,
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt
};

function renderQueue(query = "") {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(query));
  return render(<AdminReviewsPage />);
}

describe("AdminReviewsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: admin,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    apiMocks.listReviews.mockResolvedValue({
      data: [review],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });

  it("loads the pending queue as a focused list and preserves validated return context", async () => {
    renderQueue();

    expect(await screen.findByText(review.comment)).toBeInTheDocument();
    expect(apiMocks.listReviews).toHaveBeenCalledWith(
      { status: "PENDING", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );
    expect(screen.getByText("Đánh giá #9")).toBeInTheDocument();
    expect(screen.getByText("Tin đăng #42")).toBeInTheDocument();
    expect(screen.getByText("Người thuê #11")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem đánh giá" })).toHaveAttribute(
      "href",
      "/admin/reviews/9?returnStatus=PENDING&returnPage=1&returnPageSize=20"
    );
    expect(screen.queryByText(/đánh giá trong trang/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Đánh giá #9" })).not.toBeInTheDocument();
  });

  it("uses server pagination without capping page numbers", async () => {
    apiMocks.listReviews.mockResolvedValue({
      data: [review],
      pagination: { page: 101, pageSize: 20, hasNextPage: true }
    });
    renderQueue("page=101&pageSize=20");
    await screen.findByText(review.comment);
    expect(apiMocks.listReviews).toHaveBeenCalledWith(
      { status: "PENDING", page: 101, pageSize: 20 },
      expect.any(AbortSignal)
    );

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(routerMock.push).toHaveBeenCalledWith("/admin/reviews?page=102");
  });

  it("supports approved and rejected filters while resetting the page", async () => {
    const { unmount } = renderQueue("page=8&pageSize=40");
    await screen.findByText(review.comment);
    expect(screen.getByRole("link", { name: "Đã duyệt" })).toHaveAttribute(
      "href",
      "/admin/reviews?status=APPROVED&pageSize=40"
    );
    expect(screen.getByRole("link", { name: "Đã từ chối" })).toHaveAttribute(
      "href",
      "/admin/reviews?status=REJECTED&pageSize=40"
    );

    unmount();
    apiMocks.listReviews.mockClear();
    renderQueue("status=REJECTED");
    await screen.findByText(review.comment);
    expect(apiMocks.listReviews).toHaveBeenCalledWith(
      { status: "REJECTED", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );
  });

  it("renders an intentional empty state and retries queue failures", async () => {
    apiMocks.listReviews.mockResolvedValueOnce({ data: [], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    const { unmount } = renderQueue("status=APPROVED");
    expect(await screen.findByText("Không có đánh giá ở trạng thái đã duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    unmount();
    apiMocks.listReviews.mockClear();
    apiMocks.listReviews.mockRejectedValueOnce(new Error("temporary"));
    renderQueue();
    expect(await screen.findByRole("heading", { name: "Không thể tải hàng đợi đánh giá" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(apiMocks.listReviews).toHaveBeenCalledTimes(2));
  });

  it("offers previous-page recovery for a valid empty later page while preserving queue state", async () => {
    apiMocks.listReviews.mockResolvedValueOnce({ data: [], pagination: { page: 3, pageSize: 40, hasNextPage: false } });
    renderQueue("status=REJECTED&page=3&pageSize=40");

    fireEvent.click(await screen.findByRole("button", { name: "Quay lại trang trước" }));
    expect(routerMock.push).toHaveBeenCalledWith("/admin/reviews?status=REJECTED&page=2&pageSize=40");
  });

  it("blocks non-admin users before loading the queue", () => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: { ...admin, role: "TENANT" },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    renderQueue();
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listReviews).not.toHaveBeenCalled();
  });
});
