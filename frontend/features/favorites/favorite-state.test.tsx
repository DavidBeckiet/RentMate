import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { favorites: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { useFavoriteState, resetFavoriteStateForTests } from "./favorite-state";

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

function authValue(): AuthContextValue {
  return { status: "authenticated", user: tenant, error: null, refresh: vi.fn(), logout: vi.fn() };
}

function Probe({ listingId, initialSaved = false }: { readonly listingId: number; readonly initialSaved?: boolean }) {
  const { isFavorite, isPending, toggle } = useFavoriteState();
  const saved = isFavorite(listingId, initialSaved);
  const pending = isPending(listingId);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        data-testid={`favorite-${listingId}`}
        aria-pressed={saved}
        disabled={pending}
        onClick={() =>
          void toggle(listingId, saved).catch(() => {
            setError("Không thể cập nhật yêu thích");
          })
        }
      >
        {saved ? "Đã lưu" : "Chưa lưu"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

describe("shared favorite state", () => {
  beforeEach(() => {
    resetFavoriteStateForTests();
    apiMocks.list.mockReset();
    apiMocks.add.mockReset();
    apiMocks.remove.mockReset();
    apiMocks.list.mockResolvedValue({ data: [{ id: 42 }], pagination: { page: 1, pageSize: 100, hasNextPage: false } });
    apiMocks.add.mockResolvedValue(undefined);
    apiMocks.remove.mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(authValue());
  });

  it("loads favorite membership once and synchronizes every mounted instance", async () => {
    render(
      <>
        <Probe listingId={42} />
        <Probe listingId={42} />
        <Probe listingId={9} />
      </>
    );

    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledTimes(1));
    expect(apiMocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 100 }, expect.any(AbortSignal));
    expect(screen.getAllByTestId("favorite-42").every((button) => button.getAttribute("aria-pressed") === "true")).toBe(
      true
    );

    fireEvent.click(screen.getAllByTestId("favorite-42")[0]!);
    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith(42, expect.any(AbortSignal)));
    expect(
      screen.getAllByTestId("favorite-42").every((button) => button.getAttribute("aria-pressed") === "false")
    ).toBe(true);

    fireEvent.click(screen.getAllByTestId("favorite-42")[1]!);
    await waitFor(() => expect(apiMocks.add).toHaveBeenCalledWith(42, expect.any(AbortSignal)));
    expect(screen.getAllByTestId("favorite-42").every((button) => button.getAttribute("aria-pressed") === "true")).toBe(
      true
    );
  });

  it("rolls an optimistic save back when the API rejects", async () => {
    apiMocks.list.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 100, hasNextPage: false } });
    apiMocks.add.mockRejectedValue(
      new ApiError({ status: 503, code: "SAFE_ERROR", message: "private", category: "backend" })
    );
    render(<Probe listingId={42} />);

    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByTestId("favorite-42"));
    expect(screen.getByTestId("favorite-42")).toHaveAttribute("aria-pressed", "true");

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể cập nhật yêu thích");
    expect(screen.getByTestId("favorite-42")).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls an optimistic remove back when the API rejects", async () => {
    apiMocks.remove.mockRejectedValue(
      new ApiError({ status: 503, code: "SAFE_ERROR", message: "private", category: "backend" })
    );
    render(<Probe listingId={42} initialSaved />);

    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByTestId("favorite-42"));
    expect(screen.getByTestId("favorite-42")).toHaveAttribute("aria-pressed", "false");

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể cập nhật yêu thích");
    expect(screen.getByTestId("favorite-42")).toHaveAttribute("aria-pressed", "true");
  });
});
