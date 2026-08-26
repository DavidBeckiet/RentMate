import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchQueryState } from "../listings/search-query";

const apiMocks = vi.hoisted(() => ({ create: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { savedSearches: { create: apiMocks.create } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { SaveSearchControl } from "./save-search-control";

const tenantSearch: SearchQueryState = {
  mode: "bounds",
  north: 10.9,
  south: 10.6,
  east: 106.9,
  west: 106.5,
  amenities: [],
  page: 1,
  pageSize: 15,
  sort: "newest"
};

beforeEach(() => {
  useAuthMock.mockReturnValue({ status: "authenticated", user: { role: "TENANT" } });
  apiMocks.create.mockResolvedValue({});
});

describe("SaveSearchControl", () => {
  it("labels a bounds search as saving the current map area", () => {
    render(<SaveSearchControl search={tenantSearch} />);

    expect(screen.getByRole("button", { name: "Lưu tìm kiếm khu vực này" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu tìm kiếm khu vực này" }));
    expect(screen.getByRole("group", { name: "Lưu tìm kiếm khu vực này hiện tại" })).toBeInTheDocument();
  });

  it("keeps the ordinary label for a regular filter", () => {
    render(<SaveSearchControl search={{ mode: "ordinary", amenities: [], page: 1, pageSize: 15, sort: "newest" }} />);

    expect(screen.getByRole("button", { name: "Lưu bộ lọc" })).toBeInTheDocument();
  });
});
