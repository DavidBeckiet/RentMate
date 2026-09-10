import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ report: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { ...actual.api, reviews: { report: apiMocks.report } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ReportReviewControl, ReviewReportDialog } from "./report-review-control";

describe("ReportReviewControl", () => {
  beforeEach(() => {
    apiMocks.report.mockReset();
    apiMocks.report.mockResolvedValue({ id: 12, reviewId: 9, category: "INACCURATE" });
    useAuthMock.mockReturnValue({ status: "authenticated", user: { role: "TENANT" } });
  });

  it("uses a compact trigger and confirms a successful report from the shared dialog", async () => {
    const onReported = vi.fn();
    render(
      <>
        <ReportReviewControl reviewId={9} onRequestReport={(reviewId) => expect(reviewId).toBe(9)} />
        <ReviewReportDialog reviewId={9} open onClose={vi.fn()} onReported={onReported} />
      </>
    );

    expect(screen.getByRole("button", { name: "Báo cáo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Báo cáo đánh giá" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi báo cáo" }));

    await waitFor(() => expect(onReported).toHaveBeenCalledWith(9));
    expect(apiMocks.report).toHaveBeenCalledWith(9, { category: "INACCURATE", details: null });
  });

  it("keeps the sign-in prompt factual for anonymous visitors", () => {
    useAuthMock.mockReturnValue({ status: "anonymous", user: null });
    render(<ReportReviewControl reviewId={9} />);

    expect(screen.getByText(/Thấy đánh giá có vấn đề/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập để báo cáo" })).toHaveAttribute("href", "/login");
  });

  it("uses the server-derived report state instead of reopening the action", () => {
    render(<ReportReviewControl reviewId={9} hasReported />);
    expect(screen.getByRole("status")).toHaveTextContent("Bạn đã gửi báo cáo.");
    expect(screen.queryByRole("button", { name: "Báo cáo" })).not.toBeInTheDocument();
  });
});
