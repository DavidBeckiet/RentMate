import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listUsers: vi.fn() }));
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

import { ApiError } from "../../lib/api/client";
import { AdminUsersPage } from "./admin-users-page";

const refresh = vi.fn<() => Promise<void>>();
const admin: UserProfile = {
  id: 1,
  displayName: "Admin RentMate",
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};
const landlord: UserProfile = {
  ...admin,
  id: 42,
  displayName: "Minh Anh",
  role: "LANDLORD",
  email: "owner@example.com"
};
const auth = (): AuthContextValue => ({
  status: "authenticated",
  user: admin,
  error: null,
  refresh,
  logout: vi.fn()
});
const page = (data: readonly UserProfile[], current = 1, hasNextPage = false): ApiPage<UserProfile> => ({
  data,
  pagination: { page: current, pageSize: 20, hasNextPage }
});

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.query = "";
    useAuthMock.mockReturnValue(auth());
    refresh.mockResolvedValue();
  });

  it("loads q with filters and opens detail while preserving directory context", async () => {
    navigation.query = "q=Minh&role=LANDLORD&isActive=true&page=2";
    apiMocks.listUsers.mockResolvedValue(page([landlord], 2, true));
    render(<AdminUsersPage />);

    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    await waitFor(() =>
      expect(apiMocks.listUsers).toHaveBeenCalledWith(
        { q: "Minh", role: "LANDLORD", isActive: true, page: 2 },
        expect.any(AbortSignal)
      )
    );
    expect(screen.getByRole("link", { name: "Xem tài khoản Minh Anh" })).toHaveAttribute(
      "href",
      "/admin/users/42?q=Minh&role=LANDLORD&isActive=true&page=2"
    );
    expect(screen.queryByText("+84901234567")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ngừng hoạt động" })).not.toBeInTheDocument();
  });

  it("debounces search into the URL and resets page to 1", async () => {
    navigation.query = "role=TENANT&page=4";
    apiMocks.listUsers.mockResolvedValue(page([admin], 4));
    render(<AdminUsersPage />);
    await screen.findByText("admin@example.com");

    fireEvent.change(screen.getByLabelText("Tìm tài khoản"), { target: { value: "  minh@example.com  " } });
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/admin/users?q=minh%40example.com&role=TENANT")
    );
  });

  it("preserves search while role and activity filters reset pagination", async () => {
    navigation.query = "q=minh&page=3";
    apiMocks.listUsers.mockResolvedValue(page([landlord], 3));
    render(<AdminUsersPage />);
    await screen.findByText("owner@example.com");

    fireEvent.change(screen.getByLabelText("Vai trò"), { target: { value: "LANDLORD" } });
    expect(navigation.push).toHaveBeenCalledWith("/admin/users?q=minh&role=LANDLORD");
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "false" } });
    expect(navigation.push).toHaveBeenCalledWith("/admin/users?q=minh&isActive=false");
  });

  it("differentiates a filtered empty state and offers a reset", async () => {
    navigation.query = "q=missing&role=TENANT";
    apiMocks.listUsers.mockResolvedValue(page([]));
    render(<AdminUsersPage />);

    expect(await screen.findByText("Không tìm thấy tài khoản phù hợp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm và bộ lọc" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/users");
    expect(screen.queryByRole("navigation", { name: "Phân trang người dùng" })).not.toBeInTheDocument();
  });

  it("shows an API error and retries the directory request", async () => {
    apiMocks.listUsers
      .mockRejectedValueOnce(
        new ApiError({ status: 503, code: "UNAVAILABLE", message: "private", category: "backend" })
      )
      .mockResolvedValueOnce(page([admin]));
    render(<AdminUsersPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Danh sách người dùng chưa thể tải");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("admin@example.com")).toBeInTheDocument();
  });

  it("uses compact page and hasNextPage navigation without inventing totals", async () => {
    navigation.query = "page=3";
    apiMocks.listUsers.mockResolvedValue(page([admin], 3, true));
    render(<AdminUsersPage />);
    await screen.findByText("admin@example.com");

    const pagination = screen.getByRole("navigation", { name: "Phân trang người dùng" });
    expect(pagination).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/users?page=2");
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(navigation.push).toHaveBeenCalledWith("/admin/users?page=4");
    expect(screen.queryByText(/tổng/i)).not.toBeInTheDocument();
  });
});
