import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, AdminListingSummary, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listListings: vi.fn() }));
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
vi.mock("./admin-listing-card", () => ({
  AdminListingCard: ({ listing }: { listing: AdminListingSummary }) => <article>{listing.title}</article>
}));

import { AdminListingsPage } from "./admin-listings-page";

const refresh = vi.fn<() => Promise<void>>();
const admin: UserProfile = {
  id: 1,
  displayName: null,
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};
const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: "authenticated",
  user: admin,
  error: null,
  refresh,
  logout: vi.fn(),
  ...overrides
});
const listing = (id: number, title: string): AdminListingSummary => ({
  id,
  status: "PENDING",
  businessStatus: "AVAILABLE",
  title,
  areaName: "Quận 1",
  landlord: { id: 9, email: "owner@example.com", phone: "+8490", isActive: true },
  openReportCount: 0,
  possibleDuplicate: false,
  updatedAt: "2026-08-01T00:00:00Z"
});
const page = (data: readonly AdminListingSummary[], current = 1): ApiPage<AdminListingSummary> => ({
  data,
  pagination: { page: current, pageSize: 20, hasNextPage: false }
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AdminListingsPage", () => {
  beforeEach(() => {
    apiMocks.listListings.mockReset();
    navigation.query = "";
    navigation.push.mockReset();
    navigation.replace.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(auth());
  });

  it.each([
    ["loading", null],
    ["anonymous", null],
    ["authenticated", { ...admin, role: "TENANT" as const }]
  ])("gates %s without requesting the admin collection", (status, user) => {
    useAuthMock.mockReturnValue(auth({ status: status as AuthContextValue["status"], user }));
    render(<AdminListingsPage />);
    expect(apiMocks.listListings).not.toHaveBeenCalled();
  });

  it("requests PENDING by default and preserves server order without total", async () => {
    apiMocks.listListings.mockResolvedValue(page([listing(2, "Tin hai"), listing(1, "Tin một")]));
    render(<AdminListingsPage />);
    await screen.findByText("Tin hai");
    expect(apiMocks.listListings).toHaveBeenCalledWith({ status: "PENDING", page: 1 }, expect.any(AbortSignal));
    expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual(["Tin hai", "Tin một"]);
    expect(document.body).not.toHaveTextContent(/tổng cộng/i);
  });

  it("blocks malformed known query state without an API request", () => {
    navigation.query = "status=PENDING&status=HIDDEN";
    render(<AdminListingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
    expect(apiMocks.listListings).not.toHaveBeenCalled();
  });

  it("ignores an older response after URL navigation", async () => {
    const first = deferred<ApiPage<AdminListingSummary>>();
    const second = deferred<ApiPage<AdminListingSummary>>();
    apiMocks.listListings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<AdminListingsPage />);
    await waitFor(() => expect(apiMocks.listListings).toHaveBeenCalledOnce());
    navigation.query = "page=2";
    view.rerender(<AdminListingsPage />);
    await waitFor(() => expect(apiMocks.listListings).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(page([listing(2, "Mới")], 2)));
    await screen.findByText("Mới");
    await act(async () => first.resolve(page([listing(1, "Cũ")])));
    expect(screen.queryByText("Cũ")).not.toBeInTheDocument();
  });
});
