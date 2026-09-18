import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminUserDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getUser: vi.fn(), setActivation: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "" }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query)
}));
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: apiMocks }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { AdminUserDetailPage } from "./admin-user-detail";

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
const tenant: AdminUserDetail = {
  id: 42,
  displayName: "Minh Anh",
  role: "TENANT",
  email: "minh@example.com",
  phone: "+84901234567",
  isActive: true,
  emailVerified: true,
  phoneVerified: false,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-02T00:00:00Z"
};
const auth: AuthContextValue = {
  status: "authenticated",
  user: admin,
  error: null,
  refresh: vi.fn(),
  logout: vi.fn()
};

describe("AdminUserDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.query = "";
    useAuthMock.mockReturnValue(auth);
    apiMocks.getUser.mockResolvedValue(tenant);
    apiMocks.setActivation.mockResolvedValue({ ...tenant, isActive: false });
  });

  it("loads the direct account route and presents factual identity and verification states", async () => {
    navigation.query = "q=minh&role=TENANT&isActive=true&page=3&returnTo=https://evil.test";
    render(<AdminUserDetailPage userId="42" />);

    expect(await screen.findByRole("heading", { name: "Minh Anh" })).toBeInTheDocument();
    expect(apiMocks.getUser).toHaveBeenCalledWith(42);
    expect(screen.getByText("+84901234567")).toBeInTheDocument();
    expect(screen.getByText("Người thuê")).toBeInTheDocument();
    expect(screen.getByText("Đã xác minh")).toBeInTheDocument();
    expect(screen.getByText("Chưa xác minh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về danh sách người dùng" })).toHaveAttribute(
      "href",
      "/admin/users?q=minh&role=TENANT&isActive=true&page=3"
    );
  });

  it("renders a proper not-found state", async () => {
    apiMocks.getUser.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    render(<AdminUserDetailPage userId="404" />);

    expect(await screen.findByRole("heading", { name: "Không tìm thấy tài khoản" })).toBeInTheDocument();
  });

  it("keeps ADMIN account detail read-only without a disabled action", async () => {
    apiMocks.getUser.mockResolvedValue({ ...tenant, role: "ADMIN", email: "ops@example.com" });
    render(<AdminUserDetailPage userId="42" />);

    expect(await screen.findByText("Tài khoản quản trị được hiển thị ở chế độ chỉ xem.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ngừng hoạt động" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kích hoạt lại" })).not.toBeInTheDocument();
  });

  it("explains the landlord consequence in an accessible deactivation dialog", async () => {
    apiMocks.getUser.mockResolvedValue({ ...tenant, role: "LANDLORD" });
    render(<AdminUserDetailPage userId="42" />);
    const trigger = await screen.findByRole("button", { name: "Ngừng hoạt động" });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Ngừng hoạt động tài khoản?" });
    expect(within(dialog).getByText(/tin đã duyệt sẽ ngừng xuất hiện/)).toBeInTheDocument();
    expect(within(dialog).getByText(/vẫn giữ nguyên trạng thái/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Ngừng hoạt động" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("shows the reverse effect when reactivating an inactive landlord", async () => {
    apiMocks.getUser.mockResolvedValue({ ...tenant, role: "LANDLORD", isActive: false });
    render(<AdminUserDetailPage userId="42" />);
    fireEvent.click(await screen.findByRole("button", { name: "Kích hoạt lại" }));

    const dialog = await screen.findByRole("dialog", { name: "Kích hoạt lại tài khoản?" });
    expect(within(dialog).getByText(/có thể xuất hiện công khai trở lại/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kích hoạt lại" })).toBeInTheDocument();
  });

  it("stays on detail and refetches the authoritative account after mutation success", async () => {
    apiMocks.getUser.mockResolvedValueOnce(tenant).mockResolvedValueOnce({ ...tenant, isActive: false });
    render(<AdminUserDetailPage userId="42" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng hoạt động" }));
    const dialog = await screen.findByRole("dialog", { name: "Ngừng hoạt động tài khoản?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ngừng hoạt động" }));

    await waitFor(() => expect(apiMocks.setActivation).toHaveBeenCalledWith(42, { isActive: false }));
    await waitFor(() => expect(apiMocks.getUser).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("tài khoản hiện đã ngừng hoạt động");
    expect(screen.getByRole("button", { name: "Kích hoạt lại" })).toBeInTheDocument();
  });

  it("blocks repeated actions until an uncertain network result is canonically reloaded", async () => {
    apiMocks.getUser
      .mockResolvedValueOnce(tenant)
      .mockRejectedValueOnce(
        new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
      )
      .mockResolvedValueOnce({ ...tenant, isActive: false });
    apiMocks.setActivation.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    render(<AdminUserDetailPage userId="42" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng hoạt động" }));
    const dialog = await screen.findByRole("dialog", { name: "Ngừng hoạt động tài khoản?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ngừng hoạt động" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa thể tải lại trạng thái chính thức");
    expect(screen.queryByRole("button", { name: "Ngừng hoạt động" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại trạng thái" }));
    expect(await screen.findByText(/Đã tải lại trạng thái chính thức/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kích hoạt lại" })).toBeInTheDocument();
    expect(apiMocks.setActivation).toHaveBeenCalledOnce();
  });
});
