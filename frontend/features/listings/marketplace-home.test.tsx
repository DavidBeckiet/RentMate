import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));

import { MarketplaceHome } from "./marketplace-home";

beforeEach(() => {
  useAuthMock.mockReturnValue({ status: "anonymous", user: null });
});

describe("MarketplaceHome", () => {
  it("uses a Vietnamese-first marketplace hierarchy with real-data empty states", () => {
    render(
      <MarketplaceHome
        propertyTypes={[{ code: "ROOM", label: "Phòng trọ" }]}
        propertyTypesLoading={false}
        listings={null}
        listingsStatus="success"
        listingsError={null}
        onSearch={vi.fn()}
        onRetryListings={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tìm phòng.Tìm người ở ghép.Sống đúng nhịp.");
    expect(screen.getByRole("heading", { name: "Tin đăng mới nhất" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có tin đăng công khai mới")).toBeInTheDocument();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Khám phá tin đăng/ })).toHaveAttribute("href", "/search");
    expect(
      screen
        .getAllByRole("link", { name: /Tìm người ở ghép/ })
        .some((link) => link.getAttribute("href") === "/roommates")
    ).toBe(true);
    expect(screen.getByRole("link", { name: /Đăng tin trên RentMate/ })).toHaveAttribute("href", "/register/landlord");
    expect(screen.queryByText("Urban living OS")).not.toBeInTheDocument();
  });
});
