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
  it("keeps the homepage concise and ends with clear tenant and landlord actions", () => {
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

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tìm phòng đúng khu.Sống đúng nhịp.");
    expect(screen.getByRole("heading", { name: "Phòng mới, xem nhanh." })).toBeInTheDocument();
    expect(screen.getAllByText("Preview")).toHaveLength(3);
    expect(screen.queryByLabelText("Thông tin nổi bật")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tìm phòng ngay/ })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /Đăng chỗ trống/ })).toHaveAttribute("href", "/register/landlord");
    expect(screen.queryByText("Người thật nói gì?")).not.toBeInTheDocument();
    expect(screen.queryByText("Trước khi bạn bắt đầu.")).not.toBeInTheDocument();
  });
});
