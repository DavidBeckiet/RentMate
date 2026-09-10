import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ listReviews: vi.fn() }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});

import { ListingReviews } from "./listing-reviews";

function review(id: number, comment = "Thông tin đúng thực tế và chủ trọ phản hồi nhanh.") {
  return {
    id,
    overallRating: 5,
    accuracyRating: 4,
    responsivenessRating: 5,
    comment,
    createdAt: "2026-08-23T00:00:00.000Z",
    verifiedInteraction: true as const
  };
}

describe("ListingReviews", () => {
  beforeEach(() => {
    apiMocks.listReviews.mockReset();
    apiMocks.listReviews.mockResolvedValue({
      data: [review(9)],
      pagination: { page: 1, pageSize: 3, hasNextPage: false }
    });
  });

  it("loads only the three-review public preview and links to the full page", async () => {
    render(<ListingReviews listingId={42} />);

    expect(await screen.findByText("Tương tác đã xác minh")).toBeInTheDocument();
    expect(screen.getByText("Người thuê ẩn danh")).toBeInTheDocument();
    expect(screen.getByText("Thông tin đúng thực tế và chủ trọ phản hồi nhanh.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xem tất cả đánh giá/i })).toHaveAttribute("href", "/listings/42/reviews");
    expect(screen.queryByText("Độ chính xác của tin")).not.toBeInTheDocument();
    expect(screen.queryByText("Mức độ phản hồi")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/tenantId|moderationNote|reviewedByAdminId/i);
    expect(apiMocks.listReviews).toHaveBeenCalledWith(42, { page: 1, pageSize: 3 }, expect.any(AbortSignal));
  });

  it("renders at most three public reviews even when more results are returned", async () => {
    apiMocks.listReviews.mockResolvedValue({
      data: [review(1, "Một"), review(2, "Hai"), review(3, "Ba"), review(4, "Bốn")],
      pagination: { page: 1, pageSize: 3, hasNextPage: true }
    });
    render(<ListingReviews listingId={42} />);

    expect(await screen.findAllByText("Người thuê ẩn danh")).toHaveLength(3);
    expect(screen.queryByText("Bốn")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps a clear empty state when there are no approved reviews", async () => {
    apiMocks.listReviews.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 3, hasNextPage: false }
    });
    render(<ListingReviews listingId={42} />);

    expect(await screen.findByText("Chưa có đánh giá được duyệt cho tin đăng này.")).toBeInTheDocument();
    expect(screen.getByText("Các đánh giá hợp lệ sẽ xuất hiện tại đây.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Xem tất cả đánh giá/i })).not.toBeInTheDocument();
  });
});
