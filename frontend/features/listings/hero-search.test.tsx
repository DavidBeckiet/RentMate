import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroSearch } from "./hero-search";

const propertyTypes = [
  { code: "APARTMENT", label: "Apartment" },
  { code: "DORMITORY", label: "Dormitory" },
  { code: "HOUSE", label: "House" },
  { code: "ROOM", label: "Room" },
  { code: "STUDIO", label: "Studio" }
];

describe("HeroSearch", () => {
  it("offers the three search filters using clear Vietnamese labels", () => {
    render(<HeroSearch propertyTypes={propertyTypes} onSearch={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Tìm một nơi để gọi là nhà." })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Khu vực" })).toHaveAttribute("placeholder", "Quận, thành phố...");
    expect(screen.getByRole("combobox", { name: "Ngân sách mỗi tháng" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Loại phòng" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Căn hộ" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ký túc xá" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nhà nguyên căn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Phòng trọ" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Căn studio" })).toBeInTheDocument();
  });

  it("normalizes area and serializes all selected filters into the existing search values", () => {
    const onSearch = vi.fn();
    render(<HeroSearch propertyTypes={propertyTypes} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Khu vực" }), { target: { value: "binh-thanh" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Ngân sách mỗi tháng" }), { target: { value: "3-5m" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Loại phòng" }), { target: { value: "ROOM" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng" }));

    expect(onSearch).toHaveBeenCalledWith({
      areaName: "Bình Thạnh",
      minMonthlyRent: 3_000_000,
      maxMonthlyRent: 5_000_000,
      propertyType: "ROOM",
      amenities: []
    });
  });

  it.each([
    ["Bình Thạnh", "Bình Thạnh"],
    ["binh thanh", "Bình Thạnh"],
    ["binh-thanh", "Bình Thạnh"],
    ["Quận 3", "Quận 3"],
    ["Quan 3", "Quận 3"],
    ["quan-3", "Quận 3"],
    ["Q3", "Quận 3"]
  ])("uses the shared area label for %s", (input, expected) => {
    const onSearch = vi.fn();
    render(<HeroSearch propertyTypes={[]} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Khu vực" }), { target: { value: input } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng" }));

    expect(onSearch).toHaveBeenCalledWith({ areaName: expected, amenities: [] });
  });

  it("searches by budget alone without adding default filters", () => {
    const onSearch = vi.fn();
    render(<HeroSearch propertyTypes={[]} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Ngân sách mỗi tháng" }), { target: { value: "5-8m" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng" }));

    expect(onSearch).toHaveBeenCalledWith({ minMonthlyRent: 5_000_001, maxMonthlyRent: 8_000_000, amenities: [] });
  });

  it("searches by room type alone", () => {
    const onSearch = vi.fn();
    render(<HeroSearch propertyTypes={propertyTypes} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Loại phòng" }), { target: { value: "APARTMENT" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng" }));

    expect(onSearch).toHaveBeenCalledWith({ propertyType: "APARTMENT", amenities: [] });
  });

  it("uses quick area suggestions to fill the area field for a combined search", () => {
    const onSearch = vi.fn();
    render(<HeroSearch propertyTypes={propertyTypes} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Ngân sách mỗi tháng" }), { target: { value: "3-5m" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Loại phòng" }), { target: { value: "ROOM" } });
    fireEvent.click(screen.getByRole("button", { name: "Bình Thạnh" }));

    expect(screen.getByRole("textbox", { name: "Khu vực" })).toHaveValue("Bình Thạnh");
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng" }));
    expect(onSearch).toHaveBeenCalledWith({
      areaName: "Bình Thạnh",
      minMonthlyRent: 3_000_000,
      maxMonthlyRent: 5_000_000,
      propertyType: "ROOM",
      amenities: []
    });
  });
});
