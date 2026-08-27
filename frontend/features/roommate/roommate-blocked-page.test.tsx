import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateOwnedBlock, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ listOwnedBlocks: vi.fn(), unblockRequest: vi.fn(), unblockInterest: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates/blocks" }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RoommateBlockedPage } from "./roommate-blocked-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateBlockedPage", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    useAuthMock.mockReturnValue(auth());
    apiMocks.listOwnedBlocks.mockResolvedValue({
      data: [roommateOwnedBlock()],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });

  it("shows a safe empty state when the tenant has no roommate blocks", async () => {
    apiMocks.listOwnedBlocks.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    render(<RoommateBlockedPage />);

    expect(
      await screen.findByRole("heading", { name: "Bạn chưa chặn người dùng nào trong Roommate" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bỏ chặn" })).not.toBeInTheDocument();
  });

  it("requires confirmation before request-context unblock and removes only the managed block", async () => {
    apiMocks.unblockRequest.mockResolvedValue({ blocked: false });
    render(<RoommateBlockedPage />);

    expect(await screen.findByRole("heading", { name: "Minh" })).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chặn" }));
    expect(apiMocks.unblockRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận bỏ chặn" }));

    await waitFor(() => expect(apiMocks.unblockRequest).toHaveBeenCalledWith(42));
    expect(await screen.findByRole("status")).toHaveTextContent("không được khôi phục");
    expect(screen.queryByRole("heading", { name: "Minh" })).not.toBeInTheDocument();
  });

  it("uses the existing interest unblock action without exposing the action identifier", async () => {
    apiMocks.listOwnedBlocks.mockResolvedValue({
      data: [roommateOwnedBlock({ unblockAction: { kind: "INTEREST", id: 91 } })],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.unblockInterest.mockResolvedValue({ blocked: false });
    render(<RoommateBlockedPage />);

    expect(await screen.findByRole("heading", { name: "Minh" })).toBeInTheDocument();
    expect(screen.queryByText("91")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chặn" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận bỏ chặn" }));

    await waitFor(() => expect(apiMocks.unblockInterest).toHaveBeenCalledWith(91));
  });

  it("loads subsequent pages and shows a safe retry state", async () => {
    apiMocks.listOwnedBlocks
      .mockResolvedValueOnce({
        data: [roommateOwnedBlock({ counterpart: { displayName: "Trang một", memberSince: "2026-01" } })],
        pagination: { page: 1, pageSize: 20, hasNextPage: true }
      })
      .mockResolvedValueOnce({
        data: [roommateOwnedBlock({ counterpart: { displayName: "Trang hai", memberSince: null } })],
        pagination: { page: 2, pageSize: 20, hasNextPage: false }
      });
    render(<RoommateBlockedPage />);

    expect(await screen.findByRole("heading", { name: "Trang một" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() =>
      expect(apiMocks.listOwnedBlocks).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }, expect.any(AbortSignal))
    );
    expect(await screen.findByRole("heading", { name: "Trang hai" })).toBeInTheDocument();

    apiMocks.listOwnedBlocks.mockRejectedValue(
      new ApiError({ status: 503, code: "DEPENDENCY_UNAVAILABLE", message: "private", category: "backend" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});
