import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { favorites: { remove: apiMocks.remove } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { FavoriteRemoveControl } from "./favorite-remove-control";
import { resetFavoriteStateForTests } from "./favorite-state";

const refresh = vi.fn<() => Promise<void>>();

const tenant: UserProfile = {
  id: 7,
  displayName: null,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function backendError(status: number): ApiError {
  return new ApiError({ status, code: "SAFE_ERROR", message: "private", category: "backend" });
}

describe("FavoriteRemoveControl", () => {
  beforeEach(() => {
    resetFavoriteStateForTests();
    apiMocks.remove.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: tenant,
      error: null,
      refresh,
      logout: vi.fn()
    });
  });

  it("blocks duplicate DELETE submissions and calls back only after 204", async () => {
    let resolveRemove: (() => void) | undefined;
    apiMocks.remove.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRemove = resolve;
      })
    );
    const onRemoved = vi.fn<() => Promise<void>>().mockResolvedValue();
    render(<FavoriteRemoveControl listingId={42} onRemoved={onRemoved} />);

    const removeButton = screen.getByRole("button", { name: "Bỏ lưu" });
    fireEvent.click(removeButton);
    fireEvent.click(removeButton);
    expect(apiMocks.remove).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(apiMocks.remove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang bỏ lưu…" })).toBeDisabled();
    expect(onRemoved).not.toHaveBeenCalled();

    resolveRemove?.();
    await waitFor(() => expect(onRemoved).toHaveBeenCalledOnce());
  });

  it.each([
    [403, "Chức năng bỏ lưu dành cho tài khoản người thuê."],
    [422, "Yêu cầu bỏ lưu không hợp lệ."]
  ])("maps %s to safe feedback without calling success", async (status, message) => {
    apiMocks.remove.mockRejectedValue(backendError(status as number));
    const onRemoved = vi.fn();
    render(<FavoriteRemoveControl listingId={42} onRemoved={onRemoved} />);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message as string);
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("refreshes auth once after 401 without replaying DELETE", async () => {
    apiMocks.remove.mockRejectedValue(backendError(401));
    const onRemoved = vi.fn();
    render(<FavoriteRemoveControl listingId={42} onRemoved={onRemoved} />);

    fireEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên đăng nhập không còn hợp lệ");
    expect(apiMocks.remove).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onRemoved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps network ambiguity visible and allows only a manual retry", async () => {
    apiMocks.remove
      .mockRejectedValueOnce(
        new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
      )
      .mockResolvedValueOnce(undefined);
    const onRemoved = vi.fn();
    render(<FavoriteRemoveControl listingId={42} onRemoved={onRemoved} />);

    fireEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận trạng thái bỏ lưu");
    expect(apiMocks.remove).toHaveBeenCalledTimes(1);
    expect(onRemoved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledOnce());
    expect(apiMocks.remove).toHaveBeenCalledTimes(2);
  });

  it("keeps the shared DELETE alive when one control unmounts", async () => {
    let signal: AbortSignal | undefined;
    let resolveRemove: (() => void) | undefined;
    apiMocks.remove.mockImplementation((_listingId: number, requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<void>((resolve) => {
        resolveRemove = resolve;
      });
    });
    const view = render(<FavoriteRemoveControl listingId={42} onRemoved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    view.unmount();
    expect(signal?.aborted).toBe(false);
    resolveRemove?.();
    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledOnce());
  });
});
