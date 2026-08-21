import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchQueryState } from "./search-query";
import { SearchFilters, type SearchFiltersProps } from "./search-filters";

const onRetryPropertyTypes = vi.fn();
const onRetryAmenities = vi.fn();
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
      onRetryPropertyTypes={onRetryPropertyTypes}
      onRetryAmenities={onRetryAmenities}
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
  it("keeps typing as a draft until the primary search action is applied", () => {
    renderFilters();
    expect(screen.getByLabelText("Từ khóa")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Wi-Fi" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Từ khóa"), { target: { value: "  studio  " } });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(onApply).toHaveBeenCalledWith({ q: "studio", amenities: [] }, "newest");
  });

  it("validates rent and custom area pairs", () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText("Giá từ (VND/tháng)"), { target: { value: "9000000" } });
    fireEvent.change(screen.getByLabelText("Giá đến (VND/tháng)"), { target: { value: "5000000" } });
    fireEvent.click(screen.getByRole("radio", { name: "Tùy chỉnh" }));
    fireEvent.change(screen.getByLabelText("Diện tích từ (m²)"), { target: { value: "20.123" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(screen.getByText("Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /^Tiện ích/ }));
    const retries = screen.getAllByRole("button", { name: "Thử lại" });
    fireEvent.click(retries[0]!);
    fireEvent.click(retries[1]!);
    expect(onRetryPropertyTypes).toHaveBeenCalledOnce();
    expect(onRetryAmenities).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Từ khóa")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("maps a one-tap area preset to the existing min/max query contract", () => {
    renderFilters();

    fireEvent.click(screen.getByRole("radio", { name: "20 – 30 m²" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    expect(onApply).toHaveBeenCalledWith({ minRoomAreaSqm: 20, maxRoomAreaSqm: 30, amenities: [] }, "newest");
  });
});
