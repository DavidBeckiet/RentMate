import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroSearch } from "./hero-search";

describe("HeroSearch", () => {
  it("keeps location primary, presents Vietnamese room types, and preserves search codes", () => {
    const onSearch = vi.fn();

    render(
      <HeroSearch
        propertyTypes={[
          { code: "APARTMENT", label: "Apartment" },
          { code: "DORMITORY", label: "Dormitory" },
          { code: "HOUSE", label: "House" },
          { code: "ROOM", label: "Room" },
          { code: "STUDIO", label: "Studio" }
        ]}
        onSearch={onSearch}
      />
    );

    expect(screen.getByRole("heading", { level: 2, name: "Bạn muốn sống ở đâu?" })).toBeInTheDocument();
    expect(screen.getByText("Lọc theo khu vực và kiểu phòng.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhập khu vực, quận hoặc địa điểm...")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Căn hộ" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ký túc xá" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nhà nguyên căn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Phòng trọ" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Căn studio" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Khu vực hoặc tên phòng"), { target: { value: "  Quận 3  " } });
    fireEvent.change(screen.getByLabelText("Kiểu không gian"), { target: { value: "APARTMENT" } });
    fireEvent.click(screen.getByRole("button", { name: /Tìm phòng/ }));

    expect(onSearch).toHaveBeenCalledWith({ q: "Quận 3", propertyType: "APARTMENT", amenities: [] });
  });

  it("keeps quick area suggestions on the existing search behavior", () => {
    const onSearch = vi.fn();
    render(<HeroSearch propertyTypes={[]} onSearch={onSearch} />);

    fireEvent.click(screen.getByRole("button", { name: "Thảo Điền" }));

    expect(onSearch).toHaveBeenCalledWith({ q: "Thảo Điền", amenities: [] });
  });
});
