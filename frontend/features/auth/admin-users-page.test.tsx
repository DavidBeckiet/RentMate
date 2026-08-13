import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listUsers: vi.fn(), setActivation: vi.fn() }));
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
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};
const landlord: UserProfile = { ...admin, id: 2, role: "LANDLORD", email: "owner@example.com" };
const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: "authenticated",
  user: admin,
  error: null,
  refresh,
  logout: vi.fn(),
  ...overrides
});
const page = (data: readonly UserProfile[], current = 1): ApiPage<UserProfile> => ({
  data,
  pagination: { page: current, pageSize: 20, hasNextPage: false }
});

describe("AdminUsersPage", () => {
  beforeEach(() => {
    apiMocks.listUsers.mockReset();
    apiMocks.setActivation.mockReset();
    navigation.query = "";
    navigation.push.mockReset();
    navigation.replace.mockReset();
    useAuthMock.mockReturnValue(auth());
    refresh.mockResolvedValue();
  });

  it("gates a wrong role and rejects malformed filters without V1-31", () => {
    useAuthMock.mockReturnValue(auth({ user: { ...admin, role: "TENANT" } }));
    const view = render(<AdminUsersPage />);
    expect(apiMocks.listUsers).not.toHaveBeenCalled();
    useAuthMock.mockReturnValue(auth());
    navigation.query = "role=ALL";
    view.rerender(<AdminUsersPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
    expect(apiMocks.listUsers).not.toHaveBeenCalled();
  });

  it("uses omitted filters and resets page when a filter changes", async () => {
    apiMocks.listUsers.mockResolvedValue(page([admin]));
    render(<AdminUsersPage />);
    await screen.findByText("admin@example.com");
    expect(apiMocks.listUsers).toHaveBeenCalledWith({ page: 1 }, expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText("Vai trò"), { target: { value: "LANDLORD" } });
    expect(navigation.push).toHaveBeenCalledWith("/admin/users?role=LANDLORD");
  });

  it("uses inline landlord confirmation, exact PATCH body, and authoritative refetch", async () => {
    apiMocks.listUsers.mockResolvedValue(page([landlord]));
    apiMocks.setActivation.mockResolvedValue({ ...landlord, isActive: false });
    render(<AdminUsersPage />);
    await screen.findByText("owner@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Ngừng hoạt động" }));
    expect(screen.getByText(/làm các tin đã duyệt của họ biến mất/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(apiMocks.setActivation).toHaveBeenCalledWith(2, { isActive: false }));
    await waitFor(() => expect(apiMocks.listUsers).toHaveBeenCalledTimes(2));
  });

  it("requires an explicit reload after an ambiguous network result", async () => {
    apiMocks.listUsers.mockResolvedValue(page([landlord]));
    apiMocks.setActivation.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    render(<AdminUsersPage />);
    await screen.findByText("owner@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Ngừng hoạt động" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText(/Không xác định được yêu cầu/)).toBeInTheDocument();
    expect(apiMocks.setActivation).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại danh sách" }));
    await waitFor(() => expect(apiMocks.listUsers).toHaveBeenCalledTimes(2));
    expect(apiMocks.setActivation).toHaveBeenCalledOnce();
  });

  it("falls back one page when the current filtered page becomes empty", async () => {
    navigation.query = "role=LANDLORD&page=3&pageSize=40";
    apiMocks.listUsers.mockResolvedValue(page([], 3));
    render(<AdminUsersPage />);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/admin/users?role=LANDLORD&page=2&pageSize=40")
    );
  });
});
