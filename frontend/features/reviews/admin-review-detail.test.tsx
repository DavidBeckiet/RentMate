import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingReview } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getReview: vi.fn(), moderateReview: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const useSearchParamsMock = vi.hoisted(() => vi.fn<() => URLSearchParams>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ useSearchParams: useSearchParamsMock }));

import { AdminReviewDetail } from "./admin-review-detail";

const admin = {
  id: 1,
  displayName: null,
  role: "ADMIN" as const,
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const pendingReview: AdminListingReview = {
  id: 9,
  inquiryId: 7,
  listingId: 42,
  tenantId: 11,
  overallRating: 5,
  accuracyRating: 4,
  responsivenessRating: 5,
  comment: "Dòng đầu tiên\nDòng thứ hai cần giữ nguyên.",
  status: "PENDING",
  moderationNote: null,
  reviewedByAdminId: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null
};

const approvedReview: AdminListingReview = {
  ...pendingReview,
  status: "APPROVED",
  moderationNote: "Đã đọc và duyệt theo quy định.",
  reviewedByAdminId: 23,
  reviewedAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:00:00.000Z"
};

const rejectedReview: AdminListingReview = {
  ...approvedReview,
  status: "REJECTED",
  moderationNote: "Nội dung không phù hợp.",
  reviewedByAdminId: 24
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: admin,
    error: null,
    refresh: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides
  };
}

function backendError(status: number, code = "TEST_ERROR"): ApiError {
  return new ApiError({ status, code, message: "test error", requestId: "request-test", category: "backend" });
}

function networkError(): ApiError {
  return new ApiError({ status: null, code: "NETWORK_ERROR", message: "test error", category: "network" });
}

async function renderPending() {
  render(<AdminReviewDetail reviewId="9" />);
  return screen.findByRole("heading", { name: "Đánh giá #9" });
}

async function confirmDecision(label: "Duyệt đánh giá" | "Từ chối đánh giá") {
  const dialog =
    screen.queryByRole("dialog", { name: `${label}?` }) ??
    (fireEvent.click(screen.getByRole("button", { name: label })),
    await screen.findByRole("dialog", { name: `${label}?` }));
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
}

describe("AdminReviewDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(authValue());
    useSearchParamsMock.mockReturnValue(new URLSearchParams("returnStatus=PENDING&returnPage=3&pageSize=20"));
    apiMocks.getReview.mockResolvedValue(pendingReview);
    apiMocks.moderateReview.mockResolvedValue(approvedReview);
  });

  it("loads review evidence, scores, context and a safe return link", async () => {
    const heading = await renderPending();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(
      screen.getByText((_, element) => element?.tagName === "P" && element.textContent === pendingReview.comment)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Điểm tổng quan 5 trên 5")).toBeInTheDocument();
    expect(screen.getByText("Người thuê")).toBeInTheDocument();
    expect(screen.getByText("#11")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /#42/ })).toHaveAttribute("href", "/admin/listings/42");
    expect(screen.getByRole("link", { name: "Về hàng đợi đánh giá" })).toHaveAttribute("href", "/admin/reviews?page=3");
  });

  it("requires a note, preserves focus while typing, confirms approval, and reloads canonical state", async () => {
    await renderPending();
    const noteField = screen.getByLabelText("Ghi chú kiểm duyệt");
    expect(noteField).toHaveAttribute("maxlength", "1000");
    noteField.focus();
    let typed = "";
    for (const character of "Nội dung đã kiểm tra.") {
      typed += character;
      fireEvent.change(noteField, { target: { value: typed } });
    }
    expect(noteField).toHaveValue(typed);
    expect(document.activeElement).toBe(noteField);

    fireEvent.click(screen.getByRole("button", { name: "Duyệt đánh giá" }));
    expect(await screen.findByRole("dialog", { name: "Duyệt đánh giá?" })).toHaveTextContent(
      "không đảm bảo đánh giá được hiển thị ngay"
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("quyết định cuối cùng");
    apiMocks.getReview.mockResolvedValueOnce(approvedReview);
    await confirmDecision("Duyệt đánh giá");

    await waitFor(() => expect(apiMocks.moderateReview).toHaveBeenCalledWith(9, { status: "APPROVED", note: typed }));
    await waitFor(() => expect(apiMocks.getReview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Đã hoàn tất kiểm duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt đánh giá" })).not.toBeInTheDocument();
  });

  it("supports rejection, Escape closes the dialog, and focus returns to its trigger", async () => {
    await renderPending();
    const noteField = screen.getByLabelText("Ghi chú kiểm duyệt");
    fireEvent.change(noteField, { target: { value: "  Lý do từ chối.  " } });
    const rejectButton = screen.getByRole("button", { name: "Từ chối đánh giá" });
    rejectButton.focus();
    fireEvent.click(rejectButton);
    expect(await screen.findByRole("dialog", { name: "Từ chối đánh giá?" })).toHaveTextContent(
      "sẽ không xuất hiện công khai"
    );
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(rejectButton);

    apiMocks.getReview.mockResolvedValueOnce(rejectedReview);
    await confirmDecision("Từ chối đánh giá");
    await waitFor(() =>
      expect(apiMocks.moderateReview).toHaveBeenCalledWith(9, { status: "REJECTED", note: "Lý do từ chối." })
    );
  });

  it.each([
    [approvedReview, "Đã duyệt"],
    [rejectedReview, "Đã từ chối"]
  ] as const)("renders %s as a final read-only outcome", async (finalReview, label) => {
    apiMocks.getReview.mockResolvedValue(finalReview);
    await renderPending();
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText("Đã hoàn tất kiểm duyệt")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Quản trị viên #${finalReview.reviewedByAdminId}`))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt đánh giá" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Từ chối đánh giá" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ghi chú kiểm duyệt")).not.toBeInTheDocument();
  });

  it("handles a 409 with one canonical reload and never retries the PATCH", async () => {
    apiMocks.getReview.mockResolvedValueOnce(pendingReview).mockResolvedValueOnce(rejectedReview);
    apiMocks.moderateReview.mockRejectedValue(backendError(409, "CONCURRENT_MODIFICATION"));
    await renderPending();
    fireEvent.change(screen.getByLabelText("Ghi chú kiểm duyệt"), { target: { value: "Đã kiểm tra." } });
    await confirmDecision("Duyệt đánh giá");
    expect(apiMocks.moderateReview).toHaveBeenCalledTimes(1);
    expect(apiMocks.getReview).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Đánh giá đã thay đổi/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt đánh giá" })).not.toBeInTheDocument();
  });

  it("locks moderation after uncertain recovery failure until a retry succeeds", async () => {
    apiMocks.getReview
      .mockResolvedValueOnce(pendingReview)
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(pendingReview);
    apiMocks.moderateReview.mockRejectedValue(networkError());
    await renderPending();
    fireEvent.change(screen.getByLabelText("Ghi chú kiểm duyệt"), { target: { value: "Chưa chắc chắn." } });
    await confirmDecision("Duyệt đánh giá");

    expect(apiMocks.moderateReview).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("lần tải thành công gần nhất");
    expect(screen.getByRole("button", { name: "Duyệt đánh giá" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại đánh giá" }));
    await waitFor(() => expect(apiMocks.getReview).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "Duyệt đánh giá" })).not.toBeDisabled();
    expect(apiMocks.moderateReview).toHaveBeenCalledTimes(1);
  });

  it("clears the recovery lock when the detail error retry returns a canonical actionable review", async () => {
    apiMocks.getReview
      .mockResolvedValueOnce(pendingReview)
      .mockRejectedValueOnce(backendError(403, "RECOVERY_FORBIDDEN"))
      .mockResolvedValueOnce(pendingReview);
    apiMocks.moderateReview.mockRejectedValue(networkError());
    await renderPending();
    fireEvent.change(screen.getByLabelText("Ghi chú kiểm duyệt"), { target: { value: "Cần tải lại." } });
    await confirmDecision("Duyệt đánh giá");

    expect(await screen.findByRole("heading", { level: 1, name: "Không có quyền xem đánh giá" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(apiMocks.getReview).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole("heading", { name: "Đánh giá #9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt đánh giá" })).not.toBeDisabled();
  });

  it.each([
    [401, "Phiên đăng nhập không còn hợp lệ"],
    [403, "Không có quyền xem đánh giá"],
    [404, "Không tìm thấy đánh giá"]
  ] as const)("renders a coherent detail error for %s", async (status, title) => {
    apiMocks.getReview.mockRejectedValue(backendError(status));
    render(<AdminReviewDetail reviewId="9" />);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt đánh giá" })).not.toBeInTheDocument();
  });

  it("distinguishes an authenticated wrong role before loading the record", () => {
    useAuthMock.mockReturnValue(authValue({ user: { ...admin, role: "TENANT" } }));
    render(<AdminReviewDetail reviewId="9" />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.getReview).not.toHaveBeenCalled();
  });
});
