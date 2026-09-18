import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminContactReport, AdminListingReport, AdminReviewReport, AdminRoommateReport } from "../../types/api";

const adminApi = vi.hoisted(() => ({
  getReport: vi.fn(),
  updateReportStatus: vi.fn(),
  getContactReport: vi.fn(),
  updateContactReportStatus: vi.fn(),
  getReviewReport: vi.fn(),
  getReview: vi.fn(),
  updateReviewReportStatus: vi.fn()
}));
const roommateApi = vi.hoisted(() => ({
  getAdminReport: vi.fn(),
  updateAdminReportStatus: vi.fn(),
  moderateRequest: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: adminApi, roommates: roommateApi }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminReportDetail } from "./admin-report-detail";

const admin = {
  id: 1,
  displayName: null,
  role: "ADMIN" as const,
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const report: AdminListingReport = {
  id: 5,
  listing: { id: 42, title: "Phòng sáng", areaName: "Quận 3", status: "APPROVED" },
  reporter: { id: 7, email: "tenant@example.com", isActive: true },
  category: "FRAUD",
  details: "Đề nghị chuyển cọc.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: null,
  events: []
};
const contactReport: AdminContactReport = {
  id: 6,
  inquiryId: 10,
  listingId: 42,
  reporter: { id: 7, email: "tenant@example.com", isActive: true },
  message: null,
  category: "SPAM",
  details: "Tin nhắn lặp lại.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  resolvedAt: null,
  events: []
};
const reviewReport: AdminReviewReport = {
  id: 7,
  reviewId: 21,
  listingId: 42,
  reporterId: 7,
  category: "INACCURATE",
  details: null,
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  resolvedAt: null,
  events: []
};
const roommateReport: AdminRoommateReport = {
  id: 8,
  targetType: "ROOMMATE_REQUEST",
  category: "SPAM",
  details: null,
  status: "OPEN",
  resolutionNote: null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  resolvedAt: null,
  reporter: { displayName: "Người báo cáo", memberSince: report.createdAt },
  subject: { requestId: 30, messageId: null },
  evidenceSnapshot: { kind: "ROOMMATE_REQUEST" },
  events: []
};

describe("AdminReportDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: admin,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    adminApi.getReport.mockResolvedValue(report);
    adminApi.updateReportStatus.mockResolvedValue({ ...report, status: "RESOLVED", assignedAdminId: 1 });
    adminApi.getContactReport.mockResolvedValue(contactReport);
    adminApi.updateContactReportStatus.mockResolvedValue({ ...contactReport, status: "RESOLVED" });
    adminApi.getReviewReport.mockResolvedValue(reviewReport);
    adminApi.getReview.mockResolvedValue({ overallRating: 4, comment: "Ổn", status: "APPROVED" });
    roommateApi.getAdminReport.mockResolvedValue(roommateReport);
    roommateApi.updateAdminReportStatus.mockResolvedValue({ ...roommateReport, status: "RESOLVED" });
    roommateApi.moderateRequest.mockResolvedValue({ targetType: "ROOMMATE_REQUEST", state: "HIDDEN" });
  });

  it("resolves an open report directly after an explicit conclusion", async () => {
    render(<AdminReportDetail source="listing" reportId="5" />);
    expect(await screen.findByRole("heading", { name: "Lừa đảo" })).toBeInTheDocument();
    expect(screen.getByText("Tin đăng hiện tại")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu điều tra" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    expect(screen.getByRole("link", { name: "Mở trang kiểm duyệt tin" })).toHaveAttribute("href", "/admin/listings/42");
    expect(adminApi.updateReportStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất xem xét" }));
    expect(await screen.findByRole("dialog", { name: "Hoàn tất xem xét báo cáo?" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ghi chú kết luận"), { target: { value: "Đã xem xét bằng chứng." } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() =>
      expect(adminApi.updateReportStatus).toHaveBeenCalledWith(5, {
        status: "RESOLVED",
        note: "Đã xem xét bằng chứng."
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Đã hoàn tất xem xét báo cáo");
  });

  it("requires a reason and confirmation before dismissing a report", async () => {
    render(<AdminReportDetail source="listing" reportId="5" />);
    await screen.findByRole("heading", { name: "Lừa đảo" });
    fireEvent.click(screen.getByRole("button", { name: "Không có căn cứ" }));
    expect(await screen.findByRole("dialog", { name: "Kết luận không có căn cứ?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cần nhập ghi chú kết luận");
    expect(screen.getByLabelText("Lý do không cần xử lý")).toHaveFocus();
    expect(adminApi.updateReportStatus).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Lý do không cần xử lý"), { target: { value: "Chưa có căn cứ xác nhận." } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() =>
      expect(adminApi.updateReportStatus).toHaveBeenCalledWith(5, {
        status: "DISMISSED",
        note: "Chưa có căn cứ xác nhận."
      })
    );
  });

  it("keeps both decisions available for a legacy investigating report", async () => {
    adminApi.getReport.mockResolvedValue({ ...report, status: "INVESTIGATING" });
    render(<AdminReportDetail source="listing" reportId="5" />);
    await screen.findByRole("heading", { name: "Lừa đảo" });
    expect(screen.getByText(/Hồ sơ này đã được chuyển sang xem xét trước đây/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Không có căn cứ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cần xử lý" })).toBeInTheDocument();
  });

  it("explains that contact reports have no direct target action", async () => {
    render(<AdminReportDetail source="contact" reportId="6" />);
    await screen.findByRole("heading", { name: "Spam" });
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    expect(screen.getByText(/chưa có thao tác trực tiếp lên tin nhắn hoặc tài khoản/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ẩn nội dung" })).not.toBeInTheDocument();
  });

  it("does not offer unsupported enforcement for a reported review", async () => {
    render(<AdminReportDetail source="review" reportId="7" />);
    await screen.findByRole("heading", { name: "Không chính xác" });
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    expect(screen.getByText(/chưa có thao tác trực tiếp lên đánh giá đã công khai/)).toBeInTheDocument();
  });

  it("keeps roommate content moderation separate from case completion", async () => {
    render(<AdminReportDetail source="roommate" reportId="8" />);
    await screen.findByRole("heading", { name: "Spam" });
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    fireEvent.click(screen.getByRole("button", { name: "Ẩn nội dung" }));
    expect(await screen.findByRole("dialog", { name: "Ẩn nội dung được báo cáo?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cần nhập ghi chú kiểm duyệt");
    expect(screen.getByLabelText("Ghi chú thao tác với nội dung")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Ghi chú thao tác với nội dung"), { target: { value: "Ẩn để kiểm tra." } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() =>
      expect(roommateApi.moderateRequest).toHaveBeenCalledWith(30, {
        state: "HIDDEN",
        note: "Ẩn để kiểm tra.",
        reportId: 8
      })
    );
    expect(roommateApi.updateAdminReportStatus).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Hoàn tất xem xét" })).toBeInTheDocument();
  });

  it("localizes roommate profile preferences in the authorized evidence", async () => {
    roommateApi.getAdminReport.mockResolvedValue({
      ...roommateReport,
      targetType: "ROOMMATE_PROFILE",
      subject: { requestId: null, messageId: null, profileTenantId: 30 },
      evidenceSnapshot: {
        kind: "ROOMMATE_PROFILE",
        intro: "Mình muốn tìm người ở ghép tôn trọng không gian chung.",
        sleepSchedule: "STANDARD",
        cleanlinessLevel: "TIDY",
        noisePreference: "SOCIAL"
      }
    });

    render(<AdminReportDetail source="roommate" reportId="8" />);

    expect(await screen.findByText("Lịch sinh hoạt thông thường")).toBeInTheDocument();
    expect(screen.getByText("Gọn gàng")).toBeInTheDocument();
    expect(screen.getByText("Thoải mái giao lưu")).toBeInTheDocument();
    expect(screen.queryByText("STANDARD")).not.toBeInTheDocument();
    expect(screen.queryByText("TIDY")).not.toBeInTheDocument();
    expect(screen.queryByText("SOCIAL")).not.toBeInTheDocument();
  });

  it("reloads a stale report and focuses the 409 explanation", async () => {
    adminApi.getReport.mockResolvedValueOnce(report).mockResolvedValueOnce({ ...report, status: "DISMISSED" });
    adminApi.updateReportStatus.mockRejectedValueOnce(
      new ApiError({ status: 409, code: "CONCURRENT_MODIFICATION", message: "Stale report", category: "backend" })
    );
    render(<AdminReportDetail source="listing" reportId="5" />);
    await screen.findByRole("heading", { name: "Lừa đảo" });
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất xem xét" }));
    fireEvent.change(screen.getByLabelText("Ghi chú kết luận"), { target: { value: "Đã xem xét." } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hồ sơ đã thay đổi");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Hoàn tất xem xét" })).not.toBeInTheDocument();
  });

  it("keeps stale report decisions locked when 409 recovery cannot load the canonical report", async () => {
    adminApi.getReport
      .mockResolvedValueOnce(report)
      .mockRejectedValueOnce(
        new ApiError({ status: 503, code: "UNAVAILABLE", message: "Unavailable", category: "backend" })
      )
      .mockResolvedValueOnce({ ...report, status: "DISMISSED" });
    adminApi.updateReportStatus.mockRejectedValueOnce(
      new ApiError({ status: 409, code: "CONCURRENT_MODIFICATION", message: "Stale report", category: "backend" })
    );

    render(<AdminReportDetail source="listing" reportId="5" />);
    await screen.findByRole("heading", { name: "Lừa đảo" });
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất xem xét" }));
    fireEvent.change(screen.getByLabelText("Ghi chú kết luận"), { target: { value: "Đã xem xét." } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa thể xác nhận trạng thái hiện tại");
    expect(screen.getByRole("button", { name: "Không có căn cứ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tải lại hồ sơ" })).toBeEnabled();
    expect(adminApi.updateReportStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tải lại hồ sơ" }));
    expect((await screen.findAllByText("Không cần xử lý")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Không có căn cứ" })).not.toBeInTheDocument();
    expect(adminApi.updateReportStatus).toHaveBeenCalledTimes(1);
  });

  it("uses canonical recovery after an uncertain mutation outcome without repeating the decision", async () => {
    adminApi.getReport.mockResolvedValueOnce(report).mockResolvedValueOnce({ ...report, status: "DISMISSED" });
    adminApi.updateReportStatus.mockRejectedValueOnce(
      new ApiError({ status: 0, code: "NETWORK", message: "Network unavailable", category: "network" })
    );

    render(<AdminReportDetail source="listing" reportId="5" />);
    await screen.findByRole("heading", { name: "Lừa đảo" });
    fireEvent.click(screen.getByRole("button", { name: "Cần xử lý" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất xem xét" }));
    fireEvent.change(screen.getByLabelText("Ghi chú kết luận"), { target: { value: "Đã xem xét." } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Trạng thái hồ sơ đã được tải lại");
    expect(screen.getAllByText("Không cần xử lý").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Không có căn cứ" })).not.toBeInTheDocument();
    expect(adminApi.updateReportStatus).toHaveBeenCalledTimes(1);
  });

  it("renders a report-specific not-found workspace with its queue return link", async () => {
    adminApi.getContactReport.mockRejectedValueOnce(
      new ApiError({ status: 404, code: "NOT_FOUND", message: "Missing", category: "backend" })
    );

    render(<AdminReportDetail source="contact" reportId="6" />);

    expect(await screen.findByRole("heading", { name: "Không tìm thấy báo cáo liên hệ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về hàng đợi liên hệ" })).toHaveAttribute("href", "/admin/contact-reports");
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  });
});
