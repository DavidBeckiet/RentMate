import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getVerification: vi.fn(), reviewVerification: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "", push: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.query)
}));
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: apiMocks }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { AdminVerificationDetail } from "./admin-verification-detail";

const admin: UserProfile = {
  id: 1,
  displayName: "Quản trị viên",
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: "authenticated",
  user: admin,
  error: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn(),
  ...overrides
});

const pendingVerification: AdminLandlordVerification = {
  id: 9,
  landlord: { id: 7, email: "owner@example.com", phone: "+84901234567", isActive: true },
  displayName: "Nguyễn Văn An",
  requestNote: "Tôi muốn xác minh hồ sơ cho thuê.",
  status: "PENDING",
  decisionNote: null,
  reviewedByAdminId: null,
  submittedAt: "2026-08-23T08:00:00.000Z",
  reviewedAt: null,
  updatedAt: "2026-08-24T09:00:00.000Z"
};

const approvedVerification: AdminLandlordVerification = {
  ...pendingVerification,
  status: "APPROVED",
  decisionNote: "Thông tin hiện có phù hợp với hồ sơ đã gửi.",
  reviewedByAdminId: 1,
  reviewedAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T10:00:00.000Z"
};

describe("AdminVerificationDetail", () => {
  beforeEach(() => {
    apiMocks.getVerification.mockReset();
    apiMocks.reviewVerification.mockReset();
    navigation.query = "";
    navigation.push.mockReset();
    useAuthMock.mockReturnValue(auth());
    apiMocks.getVerification.mockResolvedValue(pendingVerification);
  });

  it("gates invalid ids and non-admin users before requesting evidence", () => {
    const view = render(<AdminVerificationDetail verificationId="invalid" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Mã yêu cầu xác minh không hợp lệ");
    expect(apiMocks.getVerification).not.toHaveBeenCalled();

    useAuthMock.mockReturnValue(auth({ user: { ...admin, role: "TENANT" } }));
    view.rerender(<AdminVerificationDetail verificationId="9" />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.getVerification).not.toHaveBeenCalled();
  });

  it("renders submitted evidence, current account data and validated return context", async () => {
    navigation.query = "returnStatus=PENDING&returnPage=2&returnPageSize=40";
    render(<AdminVerificationDetail verificationId="9" />);

    expect(await screen.findByRole("heading", { name: "Nguyễn Văn An", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại hàng đợi xác minh" })).toHaveAttribute(
      "href",
      "/admin/verifications?page=2&pageSize=40"
    );
    expect(screen.getByRole("heading", { name: "Hồ sơ được gửi" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tài khoản chủ trọ" })).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("+84901234567")).toBeInTheDocument();
    expect(screen.getByText("Tôi muốn xác minh hồ sơ cho thuê.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ghi chú quyết định (bắt buộc)")).toBeRequired();
    expect(document.body).not.toHaveTextContent(/CCCD|hộ chiếu|đã xác minh email|đã xác minh số điện thoại/i);
  });

  it("requires a decision note, confirms the exact action and returns after success", async () => {
    navigation.query = "returnStatus=PENDING&returnPage=2&returnPageSize=20";
    apiMocks.reviewVerification.mockResolvedValue(approvedVerification);
    render(<AdminVerificationDetail verificationId="9" />);
    await screen.findByRole("heading", { name: "Nguyễn Văn An", level: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Duyệt hồ sơ" }));
    const textarea = screen.getByLabelText("Ghi chú quyết định (bắt buộc)");
    expect(screen.getByRole("alert")).toHaveTextContent("Vui lòng nhập ghi chú quyết định");
    expect(textarea).toHaveFocus();
    expect(apiMocks.reviewVerification).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: "Đã đối chiếu thông tin hiện có." } });
    fireEvent.click(screen.getByRole("button", { name: "Duyệt hồ sơ" }));
    expect(screen.getByRole("heading", { name: "Xác nhận: Duyệt hồ sơ" })).toHaveFocus();
    expect(screen.getAllByText("Đã đối chiếu thông tin hiện có.")).toHaveLength(2);
    expect(textarea).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.getByRole("button", { name: "Duyệt hồ sơ" })).toHaveFocus();
    expect(textarea).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Duyệt hồ sơ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt hồ sơ" }));

    await waitFor(() =>
      expect(apiMocks.reviewVerification).toHaveBeenCalledWith(9, {
        status: "APPROVED",
        note: "Đã đối chiếu thông tin hiện có."
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Đã duyệt hồ sơ");
    expect(screen.getByRole("heading", { name: "Kết quả quản trị" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ghi chú quyết định (bắt buộc)")).not.toBeInTheDocument();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/admin/verifications?page=2"), {
      timeout: 2_000
    });
  });

  it("renders completed submissions as read-only cases", async () => {
    apiMocks.getVerification.mockResolvedValue(approvedVerification);
    render(<AdminVerificationDetail verificationId="9" />);

    expect(await screen.findByRole("heading", { name: "Kết quả quản trị" })).toBeInTheDocument();
    expect(screen.getAllByText("Đã xác minh").length).toBeGreaterThan(0);
    expect(screen.getByText("Thông tin hiện có phù hợp với hồ sơ đã gửi.")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ghi chú quyết định (bắt buộc)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt hồ sơ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Từ chối" })).not.toBeInTheDocument();
  });

  it("refreshes canonical detail after a conflict without resending the decision", async () => {
    apiMocks.getVerification.mockResolvedValueOnce(pendingVerification).mockResolvedValueOnce(approvedVerification);
    apiMocks.reviewVerification.mockRejectedValue(
      new ApiError({ status: 409, code: "CONFLICT", message: "stale", category: "backend" })
    );
    render(<AdminVerificationDetail verificationId="9" />);
    const textarea = await screen.findByLabelText("Ghi chú quyết định (bắt buộc)");

    fireEvent.change(textarea, { target: { value: "Từ chối vì dữ liệu không phù hợp." } });
    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận từ chối" }));

    const conflict = await screen.findByRole("alert");
    expect(conflict).toHaveTextContent("Yêu cầu đã thay đổi");
    expect(conflict).toHaveAttribute("data-tone", "warning");
    expect(conflict).toHaveFocus();
    expect(await screen.findByRole("heading", { name: "Kết quả quản trị" })).toBeInTheDocument();
    expect(apiMocks.getVerification).toHaveBeenCalledTimes(2);
    expect(apiMocks.reviewVerification).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: /Xác nhận:/ })).not.toBeInTheDocument();
  });

  it("locks decisions after an uncertain network failure until canonical state is refreshed", async () => {
    apiMocks.reviewVerification.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "offline", category: "network" })
    );
    render(<AdminVerificationDetail verificationId="9" />);
    const textarea = await screen.findByLabelText("Ghi chú quyết định (bắt buộc)");

    fireEvent.change(textarea, { target: { value: "Thông tin đã được đối chiếu." } });
    fireEvent.click(screen.getByRole("button", { name: "Duyệt hồ sơ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt hồ sơ" }));

    const uncertain = await screen.findByRole("alert");
    expect(uncertain).toHaveTextContent("Không xác định được quyết định");
    expect(uncertain).toHaveAttribute("data-tone", "warning");
    expect(screen.getByRole("button", { name: "Tải lại trạng thái" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Duyệt hồ sơ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Từ chối" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại trạng thái" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Đã tải lại trạng thái");
    expect(screen.getByRole("button", { name: "Duyệt hồ sơ" })).toBeEnabled();
    expect(apiMocks.getVerification).toHaveBeenCalledTimes(2);
    expect(apiMocks.reviewVerification).toHaveBeenCalledTimes(1);
  });

  it("does not let an older request overwrite evidence for a newer route", async () => {
    let resolveFirst: ((value: AdminLandlordVerification) => void) | undefined;
    const firstRequest = new Promise<AdminLandlordVerification>((resolve) => {
      resolveFirst = resolve;
    });
    const newerVerification = { ...pendingVerification, id: 10, displayName: "Hồ sơ mới hơn" };
    apiMocks.getVerification.mockReturnValueOnce(firstRequest).mockResolvedValueOnce(newerVerification);
    const view = render(<AdminVerificationDetail verificationId="9" />);
    view.rerender(<AdminVerificationDetail verificationId="10" />);

    expect(await screen.findByRole("heading", { name: "Hồ sơ mới hơn", level: 1 })).toBeInTheDocument();
    resolveFirst?.(pendingVerification);
    await Promise.resolve();
    expect(screen.getByRole("heading", { name: "Hồ sơ mới hơn", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nguyễn Văn An", level: 1 })).not.toBeInTheDocument();
  });
});
