import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingReview, ReviewEligibility } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getReviewEligibility: vi.fn(), createReview: vi.fn() }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { contact: apiMocks } };
});

import { TenantReviewPanel } from "./tenant-review-panel";

const pendingReview: ListingReview = {
  id: 4,
  inquiryId: 7,
  listingId: 42,
  overallRating: 5,
  accuracyRating: 4,
  responsivenessRating: 5,
  comment: "Chủ trọ phản hồi nhanh và thông tin đúng thực tế.",
  status: "PENDING",
  moderationNote: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null
};

describe("TenantReviewPanel", () => {
  beforeEach(() => {
    apiMocks.getReviewEligibility.mockResolvedValue({
      eligible: true,
      reason: null,
      review: null
    } satisfies ReviewEligibility);
    apiMocks.createReview.mockResolvedValue(pendingReview);
  });

  it("submits accessible numeric ratings and shows the pending review", async () => {
    render(<TenantReviewPanel inquiryId={7} />);
    await screen.findByLabelText("Trải nghiệm chung");
    fireEvent.change(screen.getByLabelText("Độ chính xác"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Nhận xét"), { target: { value: pendingReview.comment } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi để kiểm duyệt" }));
    await waitFor(() =>
      expect(apiMocks.createReview).toHaveBeenCalledWith(7, {
        overallRating: 5,
        accuracyRating: 4,
        responsivenessRating: 5,
        comment: pendingReview.comment
      })
    );
    expect(await screen.findByText("Đang chờ duyệt")).toBeInTheDocument();
  });

  it("explains why an inquiry without landlord reply is not eligible", async () => {
    apiMocks.getReviewEligibility.mockResolvedValue({ eligible: false, reason: "NO_LANDLORD_REPLY", review: null });
    render(<TenantReviewPanel inquiryId={7} />);
    expect(await screen.findByText(/chưa có phản hồi từ chủ trọ/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi để kiểm duyệt" })).not.toBeInTheDocument();
  });
});
