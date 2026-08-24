import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, OwnerListingDetail, OwnerListingSummary, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listOwned: vi.fn(), createDraft: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigationMocks.push, replace: navigationMocks.replace }),
  useSearchParams: () => new URLSearchParams(navigationMocks.query)
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("./owner-listing-card", () => ({
  OwnerListingCard: ({ listing }: { listing: OwnerListingSummary }) => (
    <article>{listing.title ?? "Chưa có tiêu đề"}</article>
  )
}));

import { ApiError } from "../../lib/api/client";
import { OwnerListingsPage } from "./owner-listings-page";

const refresh = vi.fn<() => Promise<void>>();
const landlord: UserProfile = {
  id: 7,
  displayName: null,
  role: "LANDLORD",
  email: "owner@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: landlord, error: null, refresh, logout: vi.fn(), ...overrides };
}

function listing(id: number, title: string): OwnerListingSummary {
  return {
    id,
    status: "DRAFT",
    title,
    monthlyRent: null,
    areaName: null,
    propertyType: null,
    coverImage: null,
    currentModerationReason: null,
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function page(
  data: readonly OwnerListingSummary[],
  currentPage = 1,
  hasNextPage = false,
  pageSize = 20
): ApiPage<OwnerListingSummary> {
  return { data, pagination: { page: currentPage, pageSize, hasNextPage } };
}

function createdDraft(): OwnerListingDetail {
  return {
    id: 88,
    status: "DRAFT",
    title: null,
    description: null,
    monthlyRent: null,
    roomAreaSqm: null,
    addressText: null,
    areaName: null,
    latitude: null,
    longitude: null,
    propertyType: null,
    amenities: [],
    images: [],
    currentModerationReason: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function backendError(status: number) {
  return new ApiError({ status, code: "SAFE_ERROR", message: "private", requestId: "req-owner", category: "backend" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("OwnerListingsPage", () => {
  beforeEach(() => {
    apiMocks.listOwned.mockReset();
    apiMocks.createDraft.mockReset();
    navigationMocks.query = "";
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(authValue());
  });

  it.each([
    ["loading", authValue({ status: "loading", user: null }), "Đang kiểm tra tài khoản"],
    ["anonymous", authValue({ status: "anonymous", user: null }), "Đăng nhập để quản lý tin"],
    ["TENANT", authValue({ user: { ...landlord, role: "TENANT" } }), "Trang này dành cho tài khoản người cho thuê"],
    ["ADMIN", authValue({ user: { ...landlord, role: "ADMIN" } }), "Trang này dành cho tài khoản người cho thuê"]
  ] as const)("gates %s without V1-12", (_label, auth, expected) => {
    useAuthMock.mockReturnValue(auth);
    render(<OwnerListingsPage />);
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    expect(apiMocks.listOwned).not.toHaveBeenCalled();
  });

  it("gates an auth error and delegates retry to auth.refresh", () => {
    useAuthMock.mockReturnValue(
      authValue({
        status: "error",
        user: null,
        error: new ApiError({ status: 500, code: "X", message: "private", category: "backend" })
      })
    );
    render(<OwnerListingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(apiMocks.listOwned).not.toHaveBeenCalled();
  });

  it("uses canonical URL state, ignores unknown keys, preserves server order, and has no total", async () => {
    navigationMocks.query = "status=approved&page=2&pageSize=40&utm_source=test";
    apiMocks.listOwned.mockResolvedValue(page([listing(2, "Tin thứ hai"), listing(1, "Tin thứ nhất")], 2, true, 40));
    render(<OwnerListingsPage />);
    await screen.findByText("Tin thứ hai");
    expect(apiMocks.listOwned).toHaveBeenCalledWith(
      { status: "APPROVED", page: 2, pageSize: 40 },
      expect.any(AbortSignal)
    );
    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => card.textContent)).toEqual(["Tin thứ hai", "Tin thứ nhất"]);
    expect(screen.getByText("Trang 2")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/tổng|tổng cộng|trang cuối/i);
  });

  it("rejects malformed known URL state locally and resets without V1-12", () => {
    navigationMocks.query = "page=1&page=2";
    render(<OwnerListingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Liên kết quản lý tin đăng không hợp lệ");
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại liên kết" }));
    expect(navigationMocks.replace).toHaveBeenCalledWith("/landlord");
    expect(apiMocks.listOwned).not.toHaveBeenCalled();
  });

  it("shows distinct all/filtered empty states and resets page when status changes", async () => {
    apiMocks.listOwned.mockResolvedValue(page([]));
    const view = render(<OwnerListingsPage />);
    expect(await screen.findByText("Bạn chưa có tin đăng.")).toBeInTheDocument();

    navigationMocks.query = "status=DRAFT&page=3&pageSize=40";
    view.rerender(<OwnerListingsPage />);
    expect(await screen.findByText("Không có tin ở trạng thái này.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "APPROVED" } });
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord?status=APPROVED&pageSize=40");
  });

  it("navigates pagination using server page/hasNextPage", async () => {
    navigationMocks.query = "status=HIDDEN&page=2&pageSize=40";
    apiMocks.listOwned.mockResolvedValue(page([listing(1, "Tin")], 2, true, 40));
    render(<OwnerListingsPage />);
    await screen.findByText("Tin");
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord?status=HIDDEN&pageSize=40");
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord?status=HIDDEN&page=3&pageSize=40");
  });

  it("ignores a stale/aborted response after URL navigation", async () => {
    const first = deferred<ApiPage<OwnerListingSummary>>();
    const second = deferred<ApiPage<OwnerListingSummary>>();
    apiMocks.listOwned.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<OwnerListingsPage />);
    await waitFor(() => expect(apiMocks.listOwned).toHaveBeenCalledOnce());
    navigationMocks.query = "page=2";
    view.rerender(<OwnerListingsPage />);
    await waitFor(() => expect(apiMocks.listOwned).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(page([listing(2, "Trang hai")], 2)));
    expect(await screen.findByText("Trang hai")).toBeInTheDocument();
    await act(async () => first.resolve(page([listing(1, "Kết quả cũ")])));
    expect(screen.queryByText("Kết quả cũ")).not.toBeInTheDocument();
  });

  it.each([
    [403, "chỉ dành cho tài khoản người cho thuê"],
    [422, "Liên kết quản lý tin đăng không hợp lệ"]
  ] as const)("renders a safe V1-12 %s error and retries explicitly", async (status, message) => {
    apiMocks.listOwned.mockRejectedValueOnce(backendError(status)).mockResolvedValueOnce(page([]));
    render(<OwnerListingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Bạn chưa có tin đăng.")).toBeInTheDocument();
    expect(apiMocks.listOwned).toHaveBeenCalledTimes(2);
  });

  it("refreshes auth at most once after V1-12 401 without request-loop replay", async () => {
    apiMocks.listOwned.mockRejectedValue(backendError(401));
    render(<OwnerListingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên đăng nhập không còn hợp lệ");
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(apiMocks.listOwned).toHaveBeenCalledOnce();
  });

  it("creates exactly one empty draft with POST {}, then navigates from the 201 response", async () => {
    const creation = deferred<OwnerListingDetail>();
    apiMocks.listOwned.mockResolvedValue(page([]));
    apiMocks.createDraft.mockReturnValue(creation.promise);
    render(<OwnerListingsPage />);
    await screen.findByText("Bạn chưa có tin đăng.");
    const createButtons = screen.getAllByRole("button", { name: "Tạo tin mới" });
    fireEvent.click(createButtons[0]);
    fireEvent.click(createButtons[0]);
    expect(apiMocks.createDraft).toHaveBeenCalledOnce();
    expect(apiMocks.createDraft).toHaveBeenCalledWith({}, expect.any(AbortSignal));
    expect(screen.getAllByRole("button", { name: "Đang tạo…" })[0]).toBeDisabled();
    await act(async () => creation.resolve(createdDraft()));
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord/listings/88");
  });

  it("keeps create network outcome ambiguous and never retries automatically", async () => {
    apiMocks.listOwned.mockResolvedValue(page([]));
    apiMocks.createDraft.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    render(<OwnerListingsPage />);
    await screen.findByText("Bạn chưa có tin đăng.");
    fireEvent.click(screen.getAllByRole("button", { name: "Tạo tin mới" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận việc tạo bản nháp");
    expect(apiMocks.createDraft).toHaveBeenCalledOnce();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });
});
