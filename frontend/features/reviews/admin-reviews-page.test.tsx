import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingReview } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listReviews: vi.fn(), getReview: vi.fn(), moderateReview: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

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

describe("AdminReviewsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 1,
        displayName: null,
        role: "ADMIN",
        email: "admin@example.com",
        phone: null,
        isActive: true,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    apiMocks.listReviews.mockResolvedValue({
      data: [review],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.getReview.mockResolvedValue(review);
    apiMocks.moderateReview.mockResolvedValue({ ...review, status: "APPROVED", moderationNote: "Nội dung hợp lệ." });
  });

  it("loads the pending queue and requires an auditable moderation note", async () => {
    render(<AdminReviewsPage />);
    expect(await screen.findByText(review.comment)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem và xử lý" }));
    expect(await screen.findByRole("heading", { name: "Đánh giá #9" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Duyệt công khai" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cần nhập ghi chú quyết định");
    fireEvent.change(screen.getByLabelText("Ghi chú quyết định"), { target: { value: "Nội dung hợp lệ." } });
    fireEvent.click(screen.getByRole("button", { name: "Duyệt công khai" }));
    await waitFor(() =>
      expect(apiMocks.moderateReview).toHaveBeenCalledWith(9, { status: "APPROVED", note: "Nội dung hợp lệ." })
    );
  });

  it("blocks non-admin users before loading the queue", () => {
    useAuthMock.mockReturnValue({ ...useAuthMock(), user: { ...useAuthMock().user!, role: "TENANT" } });
    render(<AdminReviewsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listReviews).not.toHaveBeenCalled();
  });
});
