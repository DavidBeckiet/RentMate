import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchQueryState } from "./search-query";
import { SearchFilters, type SearchFiltersProps } from "./search-filters";

const onRetryPropertyTypes = vi.fn();
const onRetryAmenities = vi.fn();
const onRetryAreas = vi.fn();
const onApply = vi.fn<SearchFiltersProps["onApply"]>();
const onClear = vi.fn();

const ordinary: SearchQueryState = {
  mode: "ordinary",
  amenities: [],
  page: 1,
  pageSize: 20,
  sort: "newest"
};

function renderFilters(overrides: Partial<SearchFiltersProps> = {}) {
  return render(
    <SearchFilters
      committed={ordinary}
      propertyTypes={{ status: "success", data: [{ code: "STUDIO", label: "Studio" }] }}
      amenities={{ status: "success", data: [{ code: "WIFI", label: "Wi-Fi" }] }}
      areas={{ status: "success", data: ["Binh Thanh", "Quan 1", "Quan 3"] }}
      onRetryPropertyTypes={onRetryPropertyTypes}
      onRetryAmenities={onRetryAmenities}
      onRetryAreas={onRetryAreas}
      onApply={onApply}
      onClear={onClear}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchFilters", () => {
  it("translates safe room type and amenity labels for presentation only", () => {
    renderFilters({
      propertyTypes: { status: "success", data: [{ code: "APARTMENT", label: "Apartment" }] },
      amenities: { status: "success", data: [{ code: "AIR_CONDITIONING", label: "Air conditioning" }] }
    });

    expect(screen.getByRole("radio", { name: "Căn hộ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bộ lọc nâng cao/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Tiện ích/ }));
    expect(screen.getByRole("checkbox", { name: "Điều hòa" })).toBeInTheDocument();
  });

  it("keeps typing as a draft until the primary search action is applied", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /Bộ lọc nâng cao/ }));
    expect(screen.getByLabelText("Tên tin đăng hoặc khu vực")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Wi-Fi" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tên tin đăng hoặc khu vực"), { target: { value: "  studio  " } });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(onApply).toHaveBeenCalledWith({ q: "studio", amenities: [] }, "newest");
  });

  it("keeps map discovery as a secondary filter action", () => {
    const onOpenMap = vi.fn();
    renderFilters({ onOpenMap });

    fireEvent.click(screen.getByRole("button", { name: "Mở bản đồ" }));

    expect(onOpenMap).toHaveBeenCalledOnce();
  });

  it("maps both budget handles to the existing minimum and maximum rent contract", () => {
    renderFilters();
    fireEvent.change(screen.getByRole("slider", { name: "Giá tối thiểu" }), {
      target: { value: "5000000" }
    });
    fireEvent.change(screen.getByRole("slider", { name: "Giá tối đa" }), {
      target: { value: "7000000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(onApply).toHaveBeenCalledWith({ minMonthlyRent: 5000000, maxMonthlyRent: 7000000, amenities: [] }, "newest");
  });

  it("keeps the two budget handles on one scale and prevents them from crossing", () => {
    renderFilters();
    fireEvent.change(screen.getByRole("slider", { name: "Giá tối đa" }), {
      target: { value: "7000000" }
    });
    fireEvent.change(screen.getByRole("slider", { name: "Giá tối thiểu" }), {
      target: { value: "7000000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(onApply).toHaveBeenCalledWith({ minMonthlyRent: 7000000, maxMonthlyRent: 7000000, amenities: [] }, "newest");
  });

  it("preserves an exact narrow or above-slider budget through editable inputs", () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText("Giá tối thiểu chính xác"), { target: { value: "20000000" } });
    fireEvent.change(screen.getByLabelText("Giá tối đa chính xác"), { target: { value: "20000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(onApply).toHaveBeenCalledWith(
      { minMonthlyRent: 20000000, maxMonthlyRent: 20000000, amenities: [] },
      "newest"
    );
  });

  it("shows a validation error instead of applying an inverted budget range", () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText("Giá tối thiểu chính xác"), { target: { value: "6000000" } });
    fireEvent.change(screen.getByLabelText("Giá tối đa chính xác"), { target: { value: "5000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(screen.getByText("Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("validates a custom area pair", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /Bộ lọc nâng cao/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Tùy chỉnh" }));
    fireEvent.change(screen.getByLabelText("Diện tích từ (m²)"), { target: { value: "20.123" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(screen.getByText("Nhập số dương với tối đa hai chữ số thập phân.")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("preserves retired lookup codes as selected removable values and explains ALL amenities", () => {
    const committed: SearchQueryState = {
      ...ordinary,
      propertyType: "OLD_ROOM",
      amenities: ["OLD_WIFI", "WIFI"]
    };
    renderFilters({ committed });

    expect(screen.getByRole("radio", { name: "Mã không còn trong danh mục: OLD_ROOM" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mã không còn trong danh mục: OLD_WIFI" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Wi-Fi" })).toBeChecked();
    expect(screen.getByText("Phòng phải có tất cả tiện ích đã chọn.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Mã không còn trong danh mục: OLD_WIFI" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ propertyType: "OLD_ROOM", amenities: ["WIFI"] }),
      "newest"
    );
  });

  it("keeps other search controls usable when lookups fail and offers independent retry/clear actions", () => {
    renderFilters({
      propertyTypes: { status: "error", data: [] },
      amenities: { status: "error", data: [] }
    });
    fireEvent.click(screen.getByRole("button", { name: /Bộ lọc nâng cao/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Tiện ích/ }));
    const retries = screen.getAllByRole("button", { name: "Thử lại" });
    fireEvent.click(retries[0]!);
    fireEvent.click(retries[1]!);
    expect(onRetryPropertyTypes).toHaveBeenCalledOnce();
    expect(onRetryAmenities).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Tên tin đăng hoặc khu vực")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("maps a one-tap area preset to the existing min/max query contract", () => {
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /Bộ lọc nâng cao/ }));
    fireEvent.click(screen.getByRole("radio", { name: "20 – 30 m²" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(onApply).toHaveBeenCalledWith({ minRoomAreaSqm: 20, maxRoomAreaSqm: 29.99, amenities: [] }, "newest");
  });

  it("uses non-overlapping inclusive decimal boundaries for the outer area presets", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /Bộ lọc nâng cao/ }));

    fireEvent.click(screen.getByRole("radio", { name: "Dưới 20 m²" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(onApply).toHaveBeenLastCalledWith({ maxRoomAreaSqm: 19.99, amenities: [] }, "newest");

    fireEvent.click(screen.getByRole("radio", { name: "Từ 60 m²" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(onApply).toHaveBeenLastCalledWith({ minRoomAreaSqm: 60, amenities: [] }, "newest");
  });

  it("filters real area suggestions, supports selection, and keeps free text available", () => {
    renderFilters();
    const area = screen.getByRole("combobox", { name: "Khu vực" });
    fireEvent.change(area, { target: { value: "binh" } });
    expect(screen.getByRole("option", { name: "Bình Thạnh" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Bình Thạnh" }));
    expect(area).toHaveValue("Bình Thạnh");
    fireEvent.change(area, { target: { value: "Khu tự nhập" } });
    expect(area).toHaveValue("Khu tự nhập");
  });

  it("keeps the area input usable when suggestions fail", () => {
    renderFilters({ areas: { status: "error", data: [] } });
    const area = screen.getByRole("combobox", { name: "Khu vực" });
    fireEvent.change(area, { target: { value: "Quan" } });
    expect(screen.getByText(/Gợi ý tạm thời không khả dụng/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetryAreas).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(onApply).toHaveBeenCalledWith({ areaName: "Quan", amenities: [] }, "newest");
  });
});
