import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile, UserRole } from "../../types/api";
import { ApiError } from "../api/transport";

const apiMocks = vi.hoisted(() => ({
  getCurrent: vi.fn<() => Promise<UserProfile>>(),
  logout: vi.fn<() => Promise<void>>()
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      users: { getCurrent: apiMocks.getCurrent },
      auth: { logout: apiMocks.logout }
    }
  };
});

import { AuthProvider, useAuth } from "./auth-provider";

function user(role: UserRole): UserProfile {
  return {
    id: 17,
    role,
    email: `${role.toLowerCase()}@example.com`,
    phone: role === "LANDLORD" ? "+84901234567" : null,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function backendError(status: number, code = "AUTHENTICATION_REQUIRED"): ApiError {
  return new ApiError({
    status,
    code,
    message: "Safe backend message.",
    requestId: "req_auth",
    category: "backend"
  });
}

function AuthConsumer() {
  const { status, user: currentUser, error, refresh, logout } = useAuth();
  return (
    <div>
      <span data-testid="public-child">Nội dung công khai</span>
      <span data-testid="status">{status}</span>
      {currentUser && <span data-testid="role">{currentUser.role}</span>}
      {error && <span data-testid="error">{error.code}</span>}
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    apiMocks.getCurrent.mockReset();
    apiMocks.logout.mockReset();
  });

  it("starts loading without blocking public children", () => {
    apiMocks.getCurrent.mockReturnValue(new Promise(() => undefined));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    expect(screen.getByTestId("public-child")).toBeInTheDocument();
  });

  it.each<UserRole>(["TENANT", "LANDLORD", "ADMIN"])("authenticates a current %s profile", async (role) => {
    apiMocks.getCurrent.mockResolvedValue(user(role));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("role")).toHaveTextContent(role);
  });

  it("maps a V1-05 401 to anonymous", async () => {
    apiMocks.getCurrent.mockRejectedValue(backendError(401));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
  });

  it.each([
    ["backend", backendError(500, "INTERNAL_ERROR")],
    [
      "network",
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "Network unavailable.", category: "network" })
    ]
  ])("keeps public children rendered in a %s error state", async (_label, error) => {
    apiMocks.getCurrent.mockRejectedValue(error);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId("status")).toHaveTextContent("error");
    expect(screen.getByTestId("error")).toHaveTextContent(error.code);
    expect(screen.getByTestId("public-child")).toBeInTheDocument();
  });

  it("refreshes V1-05 through the stable provider seam", async () => {
    apiMocks.getCurrent.mockRejectedValueOnce(backendError(401)).mockResolvedValueOnce(user("TENANT"));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId("status")).toHaveTextContent("anonymous");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByTestId("status")).toHaveTextContent("authenticated");
    expect(apiMocks.getCurrent).toHaveBeenCalledTimes(2);
  });

  it("becomes anonymous after successful logout", async () => {
    apiMocks.getCurrent.mockResolvedValue(user("LANDLORD"));
    apiMocks.logout.mockResolvedValue();

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId("status")).toHaveTextContent("authenticated");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
  });

  it("keeps the current user and surfaces a recoverable logout error", async () => {
    apiMocks.getCurrent.mockResolvedValue(user("ADMIN"));
    apiMocks.logout.mockRejectedValue(backendError(500, "INTERNAL_ERROR"));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId("status")).toHaveTextContent("authenticated");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(await screen.findByTestId("error")).toHaveTextContent("INTERNAL_ERROR");
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("role")).toHaveTextContent("ADMIN");
  });
});
