import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, PublicListingSummary, UserProfile, UserRole } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigationMocks = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationMocks.query),
  useRouter: () => ({ push: navigationMocks.push, replace: navigationMocks.replace })
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { favorites: { list: apiMocks.list, remove: apiMocks.remove } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));

import { ApiError } from "../../lib/api/client";
import { FavoritesPage } from "./favorites-page";
import { resetFavoriteStateForTests } from "./favorite-state";

const refresh = vi.fn<() => Promise<void>>();

function profile(role: UserRole): UserProfile {
  return {
    id: 7,
    displayName: null,
    role,
    email: `${role.toLowerCase()}@example.com`,
    phone: role === "LANDLORD" ? "+84901234567" : null,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: profile("TENANT"), error: null, refresh, logout: vi.fn(), ...overrides };
}

function listing(id: number, title: string): PublicListingSummary {
  return {
    id,
    title,
    monthlyRent: 7_500_000 + id,
    roomAreaSqm: 28.5,
    maxOccupants: null,
    areaName: "Bến Thành, Quận 1",
    latitude: 10.772,
    longitude: 106.698,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    coverImage: {
      url: `https://res.cloudinary.com/rentmate/image/upload/${id}.webp`,
      altText: `Ảnh ${title}`,
      displayOrder: 1
    },
    businessStatus: "AVAILABLE",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function page(
  data: readonly PublicListingSummary[],
  currentPage = 1,
  hasNextPage = false,
  pageSize = 20
): ApiPage<PublicListingSummary> {
  return { data, pagination: { page: currentPage, pageSize, hasNextPage } };
}

function backendError(status: number): ApiError {
  return new ApiError({ status, code: "SAFE_ERROR", message: "private", category: "backend" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("FavoritesPage", () => {
  beforeEach(() => {
    resetFavoriteStateForTests();
    navigationMocks.query = "";
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    apiMocks.list.mockReset();
    apiMocks.remove.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(authValue());
  });

  it("gates loading, anonymous, and auth-error states without calling V1-23", () => {
    useAuthMock.mockReturnValue(authValue({ status: "loading", user: null }));
    const view = render(<FavoritesPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Đang kiểm tra tài khoản");

    useAuthMock.mockReturnValue(authValue({ status: "anonymous", user: null }));
    view.rerender(<FavoritesPage />);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");

    useAuthMock.mockReturnValue(authValue({ status: "error", user: null, error: backendError(503) }));
    view.rerender(<FavoritesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(apiMocks.list).not.toHaveBeenCalled();
  });

  it.each(["LANDLORD", "ADMIN"] as const)("gives %s tenant-only guidance without calling V1-23", (role) => {
    useAuthMock.mockReturnValue(authValue({ user: profile(role) }));
    render(<FavoritesPage />);
    expect(screen.getByText("Trang này dành cho tài khoản người thuê")).toBeInTheDocument();
    expect(apiMocks.list).not.toHaveBeenCalled();
  });

  it("loads page one for a tenant and renders the visibility-aware empty state", async () => {
    apiMocks.list.mockResolvedValue(page([]));
    render(<FavoritesPage />);

    expect(await screen.findByText("Hiện chưa có tin đã lưu nào đang công khai.")).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith({ page: 1 }, expect.any(AbortSignal));
    expect(screen.getByText(/Tin tạm ngừng công khai có thể không xuất hiện/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Khám phá tin đăng" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/chưa từng lưu/i)).not.toBeInTheDocument();
  });

  it("hides pagination when the first page is the complete result", async () => {
    apiMocks.list.mockResolvedValue(page([listing(1, "Tin duy nhất")], 1, false));
    render(<FavoritesPage />);

    expect(await screen.findByRole("heading", { level: 2, name: "Tin duy nhất" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Phân trang tin đã lưu" })).not.toBeInTheDocument();
  });

  it("parses optional URL pagination, ignores unknown keys, and preserves backend order/privacy", async () => {
    navigationMocks.query = "page=2&pageSize=40&utm_source=test";
    const second = listing(2, "Tin thứ hai từ server");
    const first = {
      ...listing(1, "Tin thứ nhất từ server"),
      landlordContact: { email: "private@example.com", phone: "+84909999999" },
      addressText: "101 Secret Street",
      landlordId: 99,
      moderation: "HIDDEN",
      providerMetadata: "cloudinary-private"
    } as PublicListingSummary;
    apiMocks.list.mockResolvedValue(page([second, first], 2, true, 40));
    render(<FavoritesPage />);

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Tin thứ hai từ server", "Tin thứ nhất từ server"]);
    expect(apiMocks.list).toHaveBeenCalledWith({ page: 2, pageSize: 40 }, expect.any(AbortSignal));
    expect(document.body).not.toHaveTextContent(
      /private@example\.com|\+84909999999|101 Secret Street|landlordId|HIDDEN|cloudinary-private/
    );
    expect(document.body).not.toHaveTextContent(/tổng cộng|2 tin đã lưu/i);
  });

  it.each(["page=abc", "page=0", "pageSize=abc", "pageSize=0", "pageSize=101", "page=1&page=2"])(
    "rejects malformed known pagination query %s locally",
    (query) => {
      navigationMocks.query = query;
      render(<FavoritesPage />);
      expect(screen.getByRole("alert")).toHaveTextContent("Liên kết phân trang tin đã lưu không hợp lệ");
      fireEvent.click(screen.getByRole("button", { name: "Đặt lại liên kết" }));
      expect(navigationMocks.replace).toHaveBeenCalledWith("/favorites");
      expect(apiMocks.list).not.toHaveBeenCalled();
    }
  );

  it("shows safe network feedback and retries only on explicit action", async () => {
    apiMocks.list
      .mockRejectedValueOnce(
        new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
      )
      .mockResolvedValueOnce(page([]));
    render(<FavoritesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể kết nối đến máy chủ");
    expect(apiMocks.list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Hiện chưa có tin đã lưu nào đang công khai.")).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledTimes(2);
  });

  it("refreshes auth once after a V1-23 401 without entering a request loop", async () => {
    apiMocks.list.mockRejectedValue(backendError(401));
    render(<FavoritesPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên đăng nhập không còn hợp lệ");
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(apiMocks.list).toHaveBeenCalledTimes(1);
  });

  it("shows tenant-access guidance for a V1-23 403 without refreshing auth", async () => {
    apiMocks.list.mockRejectedValue(backendError(403));
    render(<FavoritesPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Trang tin đã lưu dành cho tài khoản người thuê");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("navigates through URL pagination and reloads when back/forward changes the query", async () => {
    navigationMocks.query = "page=2&pageSize=40";
    apiMocks.list.mockResolvedValueOnce(page([listing(2, "Trang hai")], 2, true, 40));
    const view = render(<FavoritesPage />);
    await screen.findByRole("heading", { level: 2, name: "Trang hai" });
    expect(screen.getByRole("navigation", { name: "Phân trang tin đã lưu" })).toHaveClass("w-fit", "max-w-full");

    fireEvent.click(screen.getByRole("button", { name: "Trước" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/favorites?pageSize=40");
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/favorites?page=3&pageSize=40");

    apiMocks.list.mockResolvedValueOnce(page([listing(3, "Trang ba")], 3, false, 40));
    navigationMocks.query = "page=3&pageSize=40";
    view.rerender(<FavoritesPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Trang ba" })).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenLastCalledWith({ page: 3, pageSize: 40 }, expect.any(AbortSignal));
  });

  it("prevents a late page-one response from overwriting page two", async () => {
    const first = deferred<ApiPage<PublicListingSummary>>();
    const second = deferred<ApiPage<PublicListingSummary>>();
    apiMocks.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<FavoritesPage />);
    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledTimes(1));

    navigationMocks.query = "page=2";
    view.rerender(<FavoritesPage />);
    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(page([listing(2, "Kết quả trang hai")], 2)));
    expect(await screen.findByRole("heading", { level: 2, name: "Kết quả trang hai" })).toBeInTheDocument();
    await act(async () => first.resolve(page([listing(1, "Kết quả cũ")])));
    expect(screen.queryByText("Kết quả cũ")).not.toBeInTheDocument();
  });

  it("lets current server visibility remove and later restore a retained favorite", async () => {
    const first = listing(1, "Tin có thể tạm ẩn");
    const second = listing(2, "Tin luôn hiển thị");
    apiMocks.list
      .mockResolvedValueOnce(page([first, second]))
      .mockResolvedValueOnce(page([second]))
      .mockResolvedValueOnce(page([first, second]));
    const view = render(<FavoritesPage />);
    expect(await screen.findByText("Tin có thể tạm ẩn")).toBeInTheDocument();

    useAuthMock.mockReturnValue(authValue({ status: "loading", user: null }));
    view.rerender(<FavoritesPage />);
    useAuthMock.mockReturnValue(authValue());
    view.rerender(<FavoritesPage />);
    await waitFor(() => expect(screen.queryByText("Tin có thể tạm ẩn")).not.toBeInTheDocument());
    expect(screen.getByText("Tin luôn hiển thị")).toBeInTheDocument();

    useAuthMock.mockReturnValue(authValue({ status: "loading", user: null }));
    view.rerender(<FavoritesPage />);
    useAuthMock.mockReturnValue(authValue());
    view.rerender(<FavoritesPage />);
    expect(await screen.findByText("Tin có thể tạm ẩn")).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledTimes(3);
  });

  it("keeps the card through DELETE ambiguity then refetches an authoritative page refill after 204", async () => {
    const first = listing(1, "Tin A");
    const second = listing(2, "Tin B");
    const refill = listing(3, "Tin C bù trang");
    const removal = deferred<void>();
    apiMocks.list.mockResolvedValueOnce(page([first, second], 1, true)).mockResolvedValueOnce(page([second, refill]));
    apiMocks.remove.mockReturnValue(removal.promise);
    render(<FavoritesPage />);
    await screen.findByText("Tin A");

    fireEvent.click(screen.getAllByRole("button", { name: "Bỏ lưu" })[0]);
    expect(apiMocks.remove).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(screen.getByText("Tin A")).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledTimes(1);

    await act(async () => removal.resolve());
    expect(await screen.findByText("Tin C bù trang")).toBeInTheDocument();
    expect(screen.getByText("Tin B")).toBeInTheDocument();
    expect(screen.queryByText("Tin A")).not.toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledTimes(2);
  });

  it("moves to the previous URL only when successful removal reconciliation empties a later page", async () => {
    navigationMocks.query = "page=2&pageSize=40";
    const initialPage = deferred<ApiPage<PublicListingSummary>>();
    const removal = deferred<void>();
    const emptyPage = deferred<ApiPage<PublicListingSummary>>();
    apiMocks.list.mockReturnValueOnce(initialPage.promise).mockReturnValueOnce(emptyPage.promise);
    apiMocks.remove.mockReturnValue(removal.promise);
    render(<FavoritesPage />);

    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledOnce());
    await act(async () => initialPage.resolve(page([listing(9, "Tin cuối trang hai")], 2, false, 40)));
    const removeButton = await screen.findByRole("button", { name: "Bỏ lưu" });

    fireEvent.click(removeButton);
    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith(9, expect.any(AbortSignal)));
    expect(apiMocks.remove).toHaveBeenCalledOnce();
    expect(apiMocks.list).toHaveBeenCalledOnce();

    await act(async () => removal.resolve());
    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledTimes(2));
    expect(navigationMocks.replace).not.toHaveBeenCalled();

    await act(async () => emptyPage.resolve(page([], 2, false, 40)));
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/favorites?pageSize=40"));
    expect(apiMocks.list).toHaveBeenCalledTimes(2);
  });
});
