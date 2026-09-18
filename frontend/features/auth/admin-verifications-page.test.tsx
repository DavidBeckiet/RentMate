import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification, ApiPage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listVerifications: vi.fn()
}));
const navigation = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.query)
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminVerificationsPage } from "./admin-verifications-page";

const verification: AdminLandlordVerification = {
  id: 9,
  landlord: { id: 7, email: "owner@example.com", phone: "+84901234567", isActive: true },
  displayName: "Nguyễn Văn An",
  requestNote: "Đề nghị duyệt hồ sơ.",
  status: "PENDING",
  decisionNote: null,
  reviewedByAdminId: null,
  submittedAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null,
  updatedAt: "2026-08-23T00:00:00.000Z"
};
const page = (
  data: readonly AdminLandlordVerification[] = [verification],
  current = 1,
  pageSize = 20,
  hasNextPage = false
): ApiPage<AdminLandlordVerification> => ({
  data,
  pagination: { page: current, pageSize, hasNextPage }
});

describe("AdminVerificationsPage", () => {
  beforeEach(() => {
    apiMocks.listVerifications.mockReset();
    navigation.query = "";
    navigation.push.mockReset();
    navigation.replace.mockReset();
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 1,
        displayName: null,
        role: "ADMIN",
        email: "admin@example.com",
        phone: null,
        isActive: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    apiMocks.listVerifications.mockResolvedValue(page());
  });

  it("renders a compact operational queue with scoped context and available evidence", async () => {
    render(<AdminVerificationsPage />);

    expect(await screen.findByRole("heading", { name: "Nguyễn Văn An" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Xác minh chủ trọ" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Lọc yêu cầu theo trạng thái" }).querySelectorAll("a")).toHaveLength(
      3
    );
    expect(screen.getByRole("link", { name: "Chờ duyệt" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Số liệu trong trang hiện tại")).toHaveTextContent("1 yêu cầu trong trang này");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("+84901234567")).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
    expect(screen.getByText("Có ghi chú")).toBeInTheDocument();
    expect(document.querySelector('time[datetime="2026-08-23T00:00:00.000Z"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem hồ sơ Nguyễn Văn An" })).toHaveAttribute(
      "href",
      "/admin/verifications/9?returnStatus=PENDING&returnPage=1&returnPageSize=20"
    );
    expect(document.body).not.toHaveTextContent(/không phải tổng hệ thống|Đang chờ quyết định|Trạng thái đang xem/i);
  });

  it("reads queue state from the URL and preserves it through tabs and compact pagination", async () => {
    navigation.query = "status=APPROVED&page=2&pageSize=40";
    apiMocks.listVerifications.mockResolvedValue(page([{ ...verification, status: "APPROVED" }], 2, 40, true));
    render(<AdminVerificationsPage />);

    await waitFor(() =>
      expect(apiMocks.listVerifications).toHaveBeenCalledWith(
        { status: "APPROVED", page: 2, pageSize: 40 },
        expect.any(AbortSignal)
      )
    );
    expect(screen.getByRole("link", { name: "Đã xác minh" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Đã từ chối" })).toHaveAttribute(
      "href",
      "/admin/verifications?status=REJECTED&pageSize=40"
    );
    const pagination = screen.getByRole("navigation", { name: "Phân trang hàng đợi xác minh" });
    expect(pagination.querySelector('[aria-current="page"]')).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/verifications?status=APPROVED&pageSize=40");
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/verifications?status=APPROVED&page=3&pageSize=40");
  });

  it("returns to the nearest previous page when the requested queue page is empty", async () => {
    navigation.query = "status=PENDING&page=2&pageSize=20";
    apiMocks.listVerifications.mockResolvedValue(page([], 2, 20, false));
    render(<AdminVerificationsPage />);

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/admin/verifications"));
    expect(screen.queryByText("Không có yêu cầu ở trạng thái này")).not.toBeInTheDocument();
  });

  it("rejects malformed URL state before loading the queue", () => {
    navigation.query = "status=PENDING&status=APPROVED";
    render(<AdminVerificationsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
    expect(apiMocks.listVerifications).not.toHaveBeenCalled();
  });

  it("blocks non-admin users before loading the queue", () => {
    useAuthMock.mockReturnValue({ ...useAuthMock(), user: { ...useAuthMock().user!, role: "TENANT" } });
    render(<AdminVerificationsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listVerifications).not.toHaveBeenCalled();
  });
});
