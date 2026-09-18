import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, AdminListingSummary, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listListings: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.query)
}));
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: apiMocks }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("./admin-listing-card", () => ({
  AdminListingCard: ({ listing }: { listing: AdminListingSummary }) => <article>{listing.title}</article>
}));

import { AdminListingsPage } from "./admin-listings-page";

const refresh = vi.fn<() => Promise<void>>();
const admin: UserProfile = {
  id: 1,
  displayName: null,
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};
const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: "authenticated",
  user: admin,
  error: null,
  refresh,
  logout: vi.fn(),
  ...overrides
});
const listing = (id: number, title: string): AdminListingSummary => ({
  id,
  status: "PENDING",
  businessStatus: "AVAILABLE",
  title,
  areaName: "Quận 1",
  landlord: { id: 9, email: "owner@example.com", phone: "+8490", isActive: true },
  openReportCount: 0,
  possibleDuplicate: false,
  updatedAt: "2026-08-01T00:00:00Z"
});
const page = (
  data: readonly AdminListingSummary[],
  current = 1,
  hasNextPage = false
): ApiPage<AdminListingSummary> => ({
  data,
  pagination: { page: current, pageSize: 20, hasNextPage }
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AdminListingsPage", () => {
  beforeEach(() => {
    apiMocks.listListings.mockReset();
    navigation.query = "";
    navigation.push.mockReset();
    navigation.replace.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(auth());
  });

  it.each([
    ["loading", null],
    ["anonymous", null],
    ["authenticated", { ...admin, role: "TENANT" as const }]
  ])("gates %s without requesting the admin collection", (status, user) => {
    useAuthMock.mockReturnValue(auth({ status: status as AuthContextValue["status"], user }));
    render(<AdminListingsPage />);
    expect(apiMocks.listListings).not.toHaveBeenCalled();
  });

  it("requests PENDING by default and preserves server order without total", async () => {
    apiMocks.listListings.mockResolvedValue(page([listing(2, "Tin hai"), listing(1, "Tin một")]));
    render(<AdminListingsPage />);
    await screen.findByText("Tin hai");
    expect(apiMocks.listListings).toHaveBeenCalledWith({ status: "PENDING", page: 1 }, expect.any(AbortSignal));
    expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual(["Tin hai", "Tin một"]);
    expect(document.body).not.toHaveTextContent(/tổng cộng/i);
    expect(screen.getByLabelText("Số liệu trong trang hiện tại")).toHaveTextContent("2 tin trong trang này");
    expect(screen.queryByText(/báo cáo mở|nghi trùng/i)).not.toBeInTheDocument();
  });

  it("shows every status as queue navigation and resets the page when switching status", async () => {
    navigation.query = "status=APPROVED&page=3";
    apiMocks.listListings.mockResolvedValue(page([], 3));
    render(<AdminListingsPage />);

    await screen.findByText("Không có tin nào ở trạng thái này");
    const statusNavigation = screen.getByRole("navigation", { name: "Lọc tin theo trạng thái" });
    expect(statusNavigation.querySelectorAll("a")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "Bản nháp" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đã duyệt" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Chờ duyệt" })).toHaveAttribute("href", "/admin/listings");
    expect(screen.getByRole("link", { name: "Bị từ chối" })).toHaveAttribute("href", "/admin/listings?status=REJECTED");
  });

  it("shows concise signals scoped to the current page", async () => {
    apiMocks.listListings.mockResolvedValue(
      page([{ ...listing(8, "Tin cần xem"), openReportCount: 2, possibleDuplicate: true }])
    );
    render(<AdminListingsPage />);

    await screen.findByText("Tin cần xem");
    const summary = screen.getByLabelText("Số liệu trong trang hiện tại");
    expect(summary).toHaveTextContent("1 tin trong trang này");
    expect(summary).toHaveTextContent("2 báo cáo mở");
    expect(summary).toHaveTextContent("1 nghi trùng");
    expect(screen.queryByText(/page size|không phải tổng hệ thống/i)).not.toBeInTheDocument();
  });

  it("shows a retryable queue error when the collection request fails", async () => {
    apiMocks.listListings.mockRejectedValueOnce(new Error("gateway unavailable")).mockResolvedValueOnce(page([]));
    render(<AdminListingsPage />);

    expect(await screen.findByText("Không thể tải hàng đợi kiểm duyệt.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(apiMocks.listListings).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Không có tin nào ở trạng thái này")).toBeInTheDocument();
  });

  it("keeps moderation pagination semantics in the compact control", async () => {
    navigation.query = "status=APPROVED&page=2";
    apiMocks.listListings.mockResolvedValue(page([listing(2, "Tin trang hai")], 2, true));
    render(<AdminListingsPage />);

    await screen.findByText("Tin trang hai");
    const pagination = screen.getByRole("navigation", { name: "Phân trang hàng đợi kiểm duyệt" });
    expect(pagination.querySelector('[aria-current="page"]')).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/listings?status=APPROVED");

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/listings?status=APPROVED&page=3");
  });

  it("offers previous-page recovery for a valid empty later page without dropping the status filter", async () => {
    navigation.query = "status=APPROVED&page=3";
    apiMocks.listListings.mockResolvedValue(page([], 3));
    render(<AdminListingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Quay lại trang trước" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/listings?status=APPROVED&page=2");
  });

  it("does not render previous-page recovery for an empty first page", async () => {
    apiMocks.listListings.mockResolvedValue(page([]));
    render(<AdminListingsPage />);

    await screen.findByText("Không có tin nào ở trạng thái này");
    expect(screen.queryByRole("button", { name: "Quay lại trang trước" })).not.toBeInTheDocument();
  });

  it("opens a listing directly by a valid ID without fetching or filtering only the visible page", async () => {
    navigation.query = "status=APPROVED&page=3";
    apiMocks.listListings.mockResolvedValue(page([], 3));
    render(<AdminListingsPage />);
    await screen.findByText("Không có tin nào ở trạng thái này");

    const input = screen.getByRole("textbox", { name: "Mở theo mã tin" });
    const open = screen.getByRole("button", { name: "Mở tin" });
    expect(open).toBeDisabled();
    fireEvent.change(input, { target: { value: "0" } });
    expect(open).toBeDisabled();
    fireEvent.change(input, { target: { value: "42" } });
    expect(open).toBeEnabled();
    fireEvent.click(open);
    expect(navigation.push).toHaveBeenCalledWith("/admin/listings/42?returnStatus=APPROVED&returnPage=3");
    expect(apiMocks.listListings).toHaveBeenCalledTimes(1);
  });

  it("blocks malformed known query state without an API request", () => {
    navigation.query = "status=PENDING&status=HIDDEN";
    render(<AdminListingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
    expect(apiMocks.listListings).not.toHaveBeenCalled();
  });

  it("ignores an older response after URL navigation", async () => {
    const first = deferred<ApiPage<AdminListingSummary>>();
    const second = deferred<ApiPage<AdminListingSummary>>();
    apiMocks.listListings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<AdminListingsPage />);
    await waitFor(() => expect(apiMocks.listListings).toHaveBeenCalledOnce());
    navigation.query = "page=2";
    view.rerender(<AdminListingsPage />);
    await waitFor(() => expect(apiMocks.listListings).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(page([listing(2, "Mới")], 2)));
    await screen.findByText("Mới");
    await act(async () => first.resolve(page([listing(1, "Cũ")])));
    expect(screen.queryByText("Cũ")).not.toBeInTheDocument();
  });
});
