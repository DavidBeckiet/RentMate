import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceHomeProps } from "./marketplace-home";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const apiMocks = vi.hoisted(() => ({ listPropertyTypes: vi.fn(), searchPublic: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      lookups: { listPropertyTypes: apiMocks.listPropertyTypes },
      listings: { searchPublic: apiMocks.searchPublic }
    }
  };
});
vi.mock("./marketplace-home", () => ({
  MarketplaceHome: (props: MarketplaceHomeProps) => (
    <section>
      <span>home-status:{props.listingsStatus}</span>
      <span>home-types:{props.propertyTypes.map((type) => type.label).join(",")}</span>
      <button type="button" onClick={() => props.onSearch({ q: "Thảo Điền", amenities: [] })}>
        Tìm từ trang chủ
      </button>
      <button
        type="button"
        onClick={() =>
          props.onSearch({
            areaName: "binh-thanh",
            minMonthlyRent: 3_000_000,
            maxMonthlyRent: 5_000_000,
            propertyType: "ROOM",
            amenities: []
          })
        }
      >
        Tìm theo bộ lọc
      </button>
      <button type="button" onClick={() => props.onSearch({ amenities: [] })}>
        Tìm mặc định
      </button>
    </section>
  )
}));

import { HomePageExperience } from "./home-page";

beforeEach(() => {
  navigation.push.mockReset();
  apiMocks.listPropertyTypes.mockReset().mockResolvedValue([{ code: "ROOM", label: "Phòng" }]);
  apiMocks.searchPublic.mockReset().mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 4, hasNextPage: false }
  });
});

describe("HomePageExperience", () => {
  it("loads homepage previews independently and sends search intent to /search", async () => {
    render(<HomePageExperience />);

    expect(await screen.findByText("home-status:success")).toBeInTheDocument();
    expect(await screen.findByText("home-types:Phòng")).toBeInTheDocument();
    expect(apiMocks.searchPublic).toHaveBeenCalledWith(
      { page: 1, pageSize: 4, sort: "newest" },
      expect.any(AbortSignal)
    );

    fireEvent.click(screen.getByRole("button", { name: "Tìm từ trang chủ" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/search?q=Th%E1%BA%A3o+%C4%90i%E1%BB%81n"));
  });

  it("uses the shared search serializer for combined homepage filters", async () => {
    render(<HomePageExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "Tìm theo bộ lọc" }));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/search?areaName=B%C3%ACnh+Th%E1%BA%A1nh&minMonthlyRent=3000000&maxMonthlyRent=5000000&propertyType=ROOM"
      )
    );
  });

  it("omits default search filters from the homepage URL", async () => {
    render(<HomePageExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "Tìm mặc định" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/search"));
  });
});
