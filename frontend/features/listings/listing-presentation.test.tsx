import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingAmenityChips, ListingImage, ListingPrice } from "./listing-presentation";

describe("listing presentation primitives", () => {
  it("keeps the image placeholder meaningful when a card has no image", () => {
    render(<ListingImage image={null} title="Phòng yên tĩnh" sizes="100vw" />);

    expect(screen.getByRole("img", { name: "Chưa có ảnh cho Phòng yên tĩnh" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có ảnh")).toBeInTheDocument();
  });

  it("keeps pricing and every API-provided amenity visible", () => {
    render(
      <>
        <ListingPrice monthlyRent={8500000} />
        <ListingAmenityChips
          amenities={[
            { code: "WIFI", label: "Wi-Fi" },
            { code: "PARKING", label: "Chỗ để xe" }
          ]}
        />
      </>
    );

    expect(screen.getByText("8.500.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("/ tháng")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Tiện ích" })).toHaveTextContent("Wi-Fi");
    expect(screen.getByRole("list", { name: "Tiện ích" })).toHaveTextContent("Chỗ để xe");
  });
});
