import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { UserProfile, UserRole } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { favorites: { add: apiMocks.add, remove: apiMocks.remove } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { FavoriteSaveControl } from "./favorite-save-control";
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

function backendError(status: number): ApiError {
  return new ApiError({ status, code: "SAFE_ERROR", message: "private", category: "backend" });
}

describe("FavoriteSaveControl", () => {
  beforeEach(() => {
    resetFavoriteStateForTests();
    apiMocks.add.mockReset();
    apiMocks.remove.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(authValue());
  });

  it("gates loading, anonymous, and auth-error states without a PUT", () => {
    useAuthMock.mockReturnValue(authValue({ status: "loading", user: null }));
    const view = render(<FavoriteSaveControl listingId="42" />);
    expect(screen.getByRole("status")).toHaveTextContent("Đang kiểm tra quyền lưu tin");

    useAuthMock.mockReturnValue(authValue({ status: "anonymous", user: null }));
    view.rerender(<FavoriteSaveControl listingId="42" />);
    expect(screen.getByRole("link", { name: "Đăng nhập bằng tài khoản người thuê" })).toHaveAttribute("href", "/login");

    useAuthMock.mockReturnValue(authValue({ status: "error", user: null, error: backendError(503) }));
    view.rerender(<FavoriteSaveControl listingId="42" />);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(apiMocks.add).not.toHaveBeenCalled();
    expect(apiMocks.remove).not.toHaveBeenCalled();
  });

  it.each(["LANDLORD", "ADMIN"] as const)("shows tenant-only guidance to %s without a PUT", (role) => {
    useAuthMock.mockReturnValue(authValue({ user: profile(role) }));
    render(<FavoriteSaveControl listingId="42" />);
    expect(screen.getByText("Chức năng lưu tin dành cho tài khoản người thuê.")).toBeInTheDocument();
    expect(apiMocks.add).not.toHaveBeenCalled();
    expect(apiMocks.remove).not.toHaveBeenCalled();
  });

  it("blocks duplicate clicks, then supports save and remove with selected-state feedback", async () => {
    let resolveAdd: (() => void) | undefined;
    apiMocks.add.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAdd = resolve;
      })
    );
    render(<FavoriteSaveControl listingId="42" />);

    const saveButton = screen.getByRole("button", { name: "Thêm vào yêu thích" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(apiMocks.add).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(apiMocks.add).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();

    resolveAdd?.();
    const savedButton = await screen.findByRole("button", { name: "Bỏ khỏi yêu thích" });
    expect(savedButton).not.toBeDisabled();
    expect(savedButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Đã thêm vào danh sách yêu thích");

    apiMocks.remove.mockResolvedValue(undefined);
    fireEvent.click(savedButton);
    expect(apiMocks.remove).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Đang bỏ lưu…" })).toBeDisabled();
    const unsavedButton = await screen.findByRole("button", { name: "Thêm vào yêu thích" });
    expect(unsavedButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Đã bỏ khỏi danh sách yêu thích");
  });

  it("starts selected when the parent supplies an existing favorite", () => {
    render(<FavoriteSaveControl listingId="42" initialSaved />);

    const button = screen.getByRole("button", { name: "Bỏ khỏi yêu thích" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(apiMocks.add).not.toHaveBeenCalled();
    expect(apiMocks.remove).not.toHaveBeenCalled();
  });

  it.each([
    [404, "Tin đăng hiện không còn khả dụng để lưu."],
    [403, "Chức năng lưu tin dành cho tài khoản người thuê."],
    [422, "Yêu cầu lưu tin không hợp lệ."]
  ])("maps %s to safe feedback", async (status, message) => {
    apiMocks.add.mockRejectedValue(backendError(status as number));
    render(<FavoriteSaveControl listingId="42" />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào yêu thích" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message as string);
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
  });

  it("refreshes auth at most once after 401 and never replays the mutation", async () => {
    apiMocks.add.mockRejectedValue(backendError(401));
    render(<FavoriteSaveControl listingId="42" />);

    fireEvent.click(screen.getByRole("button", { name: "Thêm vào yêu thích" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên đăng nhập không còn hợp lệ");
    expect(apiMocks.add).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Thêm vào yêu thích" }));
    await waitFor(() => expect(apiMocks.add).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a network result ambiguous and retries only after another click", async () => {
    apiMocks.add
      .mockRejectedValueOnce(
        new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
      )
      .mockResolvedValueOnce(undefined);
    render(<FavoriteSaveControl listingId="42" />);

    fireEvent.click(screen.getByRole("button", { name: "Thêm vào yêu thích" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận trạng thái lưu");
    expect(apiMocks.add).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Thêm vào yêu thích" }));
    expect(await screen.findByRole("button", { name: "Bỏ khỏi yêu thích" })).toHaveAttribute("aria-pressed", "true");
    expect(apiMocks.add).toHaveBeenCalledTimes(2);
  });

  it("keeps the shared PUT alive when one control unmounts", async () => {
    let signal: AbortSignal | undefined;
    let resolveAdd: (() => void) | undefined;
    apiMocks.add.mockImplementation((_listingId: number, requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<void>((resolve) => {
        resolveAdd = resolve;
      });
    });
    const view = render(<FavoriteSaveControl listingId="42" />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào yêu thích" }));
    view.unmount();
    expect(signal?.aborted).toBe(false);
    resolveAdd?.();
    await waitFor(() => expect(apiMocks.add).toHaveBeenCalledOnce());
  });
});
