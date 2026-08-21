"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { CheckboxField, CheckboxGroup, InputField, SelectField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import type { Amenity, PropertyType, PublicListingSort } from "../../types/api";
import { activeFilterCount, searchFilterValues, type SearchFilterValues, type SearchQueryState } from "./search-query";

export interface LookupResource<T> {
  readonly status: "loading" | "success" | "error";
  readonly data: readonly T[];
}

export interface SearchFiltersProps {
  readonly committed: SearchQueryState;
  readonly propertyTypes: LookupResource<PropertyType>;
  readonly amenities: LookupResource<Amenity>;
  readonly onRetryPropertyTypes: () => void;
  readonly onRetryAmenities: () => void;
  readonly onApply: (values: SearchFilterValues, sort: PublicListingSort) => void;
  readonly onClear: () => void;
}

interface FilterDraft {
  readonly q: string;
  readonly areaName: string;
  readonly minMonthlyRent: string;
  readonly maxMonthlyRent: string;
  readonly minRoomAreaSqm: string;
  readonly maxRoomAreaSqm: string;
  readonly propertyType: string;
  readonly amenities: readonly string[];
  readonly sort: PublicListingSort;
}

type FieldErrors = Partial<Record<keyof FilterDraft, string>>;

function draftFromState(state: SearchQueryState): FilterDraft {
  const values = searchFilterValues(state);
  return {
    q: values.q ?? "",
    areaName: values.areaName ?? "",
    minMonthlyRent: values.minMonthlyRent === undefined ? "" : String(values.minMonthlyRent),
    maxMonthlyRent: values.maxMonthlyRent === undefined ? "" : String(values.maxMonthlyRent),
    minRoomAreaSqm: values.minRoomAreaSqm === undefined ? "" : String(values.minRoomAreaSqm),
    maxRoomAreaSqm: values.maxRoomAreaSqm === undefined ? "" : String(values.maxRoomAreaSqm),
    propertyType: values.propertyType ?? "",
    amenities: values.amenities,
    sort: state.sort
  };
}

function parseWhole(value: string, field: keyof FilterDraft, errors: FieldErrors): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^[0-9]+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) {
    errors[field] = "Nhập một số nguyên dương.";
    return undefined;
  }
  return Number(value);
}

function parseArea(value: string, field: keyof FilterDraft, errors: FieldErrors): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value) || Number(value) <= 0 || !Number.isFinite(Number(value))) {
    errors[field] = "Nhập số dương với tối đa hai chữ số thập phân.";
    return undefined;
  }
  return Number(value);
}

function validateDraft(draft: FilterDraft): { values?: SearchFilterValues; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const minMonthlyRent = parseWhole(draft.minMonthlyRent, "minMonthlyRent", errors);
  const maxMonthlyRent = parseWhole(draft.maxMonthlyRent, "maxMonthlyRent", errors);
  const minRoomAreaSqm = parseArea(draft.minRoomAreaSqm, "minRoomAreaSqm", errors);
  const maxRoomAreaSqm = parseArea(draft.maxRoomAreaSqm, "maxRoomAreaSqm", errors);

  if (minMonthlyRent !== undefined && maxMonthlyRent !== undefined && maxMonthlyRent < minMonthlyRent) {
    errors.maxMonthlyRent = "Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.";
  }
  if (minRoomAreaSqm !== undefined && maxRoomAreaSqm !== undefined && maxRoomAreaSqm < minRoomAreaSqm) {
    errors.maxRoomAreaSqm = "Diện tích tối đa phải lớn hơn hoặc bằng diện tích tối thiểu.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    values: {
      ...(draft.q.trim() ? { q: draft.q.trim() } : {}),
      ...(draft.areaName.trim() ? { areaName: draft.areaName.trim() } : {}),
      ...(minMonthlyRent === undefined ? {} : { minMonthlyRent }),
      ...(maxMonthlyRent === undefined ? {} : { maxMonthlyRent }),
      ...(minRoomAreaSqm === undefined ? {} : { minRoomAreaSqm }),
      ...(maxRoomAreaSqm === undefined ? {} : { maxRoomAreaSqm }),
      ...(draft.propertyType ? { propertyType: draft.propertyType } : {}),
      amenities: draft.amenities
    }
  };
}

function hasSecondaryFilters(state: SearchQueryState): boolean {
  return Boolean(
    state.areaName ||
      state.minMonthlyRent ||
      state.maxMonthlyRent ||
      state.minRoomAreaSqm ||
      state.maxRoomAreaSqm ||
      state.propertyType ||
      state.amenities.length > 0 ||
      state.sort !== (state.mode === "radius" ? "distance_asc" : "newest")
  );
}

export function SearchFilters({
  committed,
  propertyTypes,
  amenities,
  onRetryPropertyTypes,
  onRetryAmenities,
  onApply,
  onClear
}: SearchFiltersProps) {
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromState(committed));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [advancedOpen, setAdvancedOpen] = useState(() => hasSecondaryFilters(committed));

  useEffect(() => {
    setDraft(draftFromState(committed));
    setErrors({});
    if (hasSecondaryFilters(committed)) setAdvancedOpen(true);
  }, [committed]);

  const propertyOptions = useMemo(() => {
    const options = [...propertyTypes.data];
    if (draft.propertyType && !options.some((option) => option.code === draft.propertyType)) {
      options.push({ code: draft.propertyType, label: `Mã không còn trong danh mục: ${draft.propertyType}` });
    }
    return options;
  }, [draft.propertyType, propertyTypes.data]);

  const amenityOptions = useMemo(() => {
    const options = [...amenities.data];
    for (const selected of draft.amenities) {
      if (!options.some((option) => option.code === selected)) {
        options.push({ code: selected, label: `Mã không còn trong danh mục: ${selected}` });
      }
    }
    return options;
  }, [amenities.data, draft.amenities]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (result.values) onApply(result.values, draft.sort);
  };

  const clear = () => {
    setDraft(draftFromState({ mode: "ordinary", amenities: [], page: 1, pageSize: 20, sort: "newest" }));
    setErrors({});
    setAdvancedOpen(false);
    onClear();
  };

  const count = activeFilterCount(committed);

  return (
    <form
      onSubmit={submit}
      className="sticky top-24 border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass"
      noValidate
    >
      <div className="mb-5 flex items-center justify-between border-b-2 border-heroDark-950 pb-4">
        <div className="flex items-center gap-2">
          <Icon name="target" className="h-5 w-5" />
          <h2 className="font-display text-xl font-bold tracking-[-0.04em]">Bộ lọc</h2>
        </div>
        {count > 0 ? (
          <span className="border-2 border-heroDark-950 bg-rent-yellow px-2 py-1 font-display text-[10px] font-bold uppercase">
            {count} đang dùng
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:grid-cols-1">
        <InputField
          id="listing-search-q"
          name="q"
          label="Tên phòng hoặc khu vực"
          placeholder="Ví dụ: studio gần Bến Thành"
          value={draft.q}
          onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
        />
        <Button type="submit" className="w-full">
          <Icon name="search" className="h-4 w-4" />
          Tìm kiếm
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t-2 border-heroDark-950 pt-4">
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="advanced-listing-filters"
          className="inline-flex min-h-10 items-center gap-2 border-2 border-heroDark-950 bg-[#e5eefc] px-3 font-display text-xs font-bold shadow-glass-sm lg:hidden"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          {advancedOpen ? "Ẩn bộ lọc nâng cao" : "Hiện bộ lọc nâng cao"}
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 border-2 border-heroDark-950 bg-rent-yellow px-3 font-display text-xs font-bold shadow-glass-sm"
          onClick={clear}
        >
          <Icon name="close" className="h-3.5 w-3.5" />
          Xóa bộ lọc
        </button>
      </div>

      <div id="advanced-listing-filters" className={`${advancedOpen ? "block" : "hidden"} mt-5 space-y-5 lg:block`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <InputField
            id="listing-area-name"
            name="areaName"
            label="Khu vực gần đúng"
            placeholder="Ví dụ: Quận 1"
            value={draft.areaName}
            onChange={(event) => setDraft((current) => ({ ...current, areaName: event.target.value }))}
          />
          <InputField
            id="listing-min-rent"
            name="minMonthlyRent"
            label="Giá từ (VND/tháng)"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={draft.minMonthlyRent}
            error={errors.minMonthlyRent}
            onChange={(event) => setDraft((current) => ({ ...current, minMonthlyRent: event.target.value }))}
          />
          <InputField
            id="listing-max-rent"
            name="maxMonthlyRent"
            label="Giá đến (VND/tháng)"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={draft.maxMonthlyRent}
            error={errors.maxMonthlyRent}
            onChange={(event) => setDraft((current) => ({ ...current, maxMonthlyRent: event.target.value }))}
          />
          <InputField
            id="listing-min-area"
            name="minRoomAreaSqm"
            label="Diện tích từ (m²)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={draft.minRoomAreaSqm}
            error={errors.minRoomAreaSqm}
            onChange={(event) => setDraft((current) => ({ ...current, minRoomAreaSqm: event.target.value }))}
          />
          <InputField
            id="listing-max-area"
            name="maxRoomAreaSqm"
            label="Diện tích đến (m²)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={draft.maxRoomAreaSqm}
            error={errors.maxRoomAreaSqm}
            onChange={(event) => setDraft((current) => ({ ...current, maxRoomAreaSqm: event.target.value }))}
          />
          <SelectField
            id="listing-property-type"
            name="propertyType"
            label="Loại hình"
            value={draft.propertyType}
            onChange={(event) => setDraft((current) => ({ ...current, propertyType: event.target.value }))}
          >
            <option value="">Tất cả loại hình</option>
            {propertyOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="listing-sort"
            name="sort"
            label="Sắp xếp"
            value={committed.mode === "radius" ? "distance_asc" : draft.sort}
            disabled={committed.mode === "radius"}
            onChange={(event) => setDraft((current) => ({ ...current, sort: event.target.value as PublicListingSort }))}
          >
            {committed.mode === "radius" ? (
              <option value="distance_asc">Khoảng cách gần nhất</option>
            ) : (
              <>
                <option value="newest">Mới cập nhật</option>
                <option value="rent_asc">Giá thấp đến cao</option>
                <option value="rent_desc">Giá cao đến thấp</option>
              </>
            )}
          </SelectField>
        </div>

        <div className="space-y-4 border-t-2 border-heroDark-950 pt-5">
          <div className="border-2 border-heroDark-950 bg-rent-yellow p-3">
            <h3 className="font-display text-sm font-bold">Danh mục loại hình</h3>
            {propertyTypes.status === "loading" ? (
              <p role="status" className="mt-2 text-sm font-semibold">
                Đang tải loại hình…
              </p>
            ) : propertyTypes.status === "error" ? (
              <div role="alert" className="mt-2 text-sm font-semibold text-red-800">
                <p>Không thể tải loại hình. Các bộ lọc khác vẫn dùng được.</p>
                <Button variant="secondary" className="mt-3" onClick={onRetryPropertyTypes}>
                  Thử lại
                </Button>
              </div>
            ) : propertyTypes.data.length === 0 ? (
              <p className="mt-2 text-sm font-semibold">Hiện chưa có loại hình đang hoạt động.</p>
            ) : (
              <p className="mt-2 text-sm font-semibold">Chọn một loại hình từ danh sách phía trên.</p>
            )}
          </div>

          <div className="border-2 border-heroDark-950 bg-[#e5eefc] p-3">
            <CheckboxGroup id="listing-amenities" legend="Tiện ích" hint="Tin đăng phải có tất cả tiện ích bạn chọn.">
              {amenities.status === "loading" ? (
                <p role="status" className="text-sm font-semibold">
                  Đang tải tiện ích…
                </p>
              ) : amenities.status === "error" ? (
                <div role="alert" className="text-sm font-semibold text-red-800">
                  <p>Không thể tải tiện ích. Các bộ lọc khác vẫn dùng được.</p>
                  <Button variant="secondary" className="mt-3" onClick={onRetryAmenities}>
                    Thử lại
                  </Button>
                </div>
              ) : amenityOptions.length === 0 ? (
                <p className="text-sm font-semibold">Hiện chưa có tiện ích đang hoạt động.</p>
              ) : (
                <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-1">
                  {amenityOptions.map((amenity) => (
                    <CheckboxField
                      key={amenity.code}
                      id={`amenity-${amenity.code}`}
                      name="amenities"
                      label={amenity.label}
                      value={amenity.code}
                      checked={draft.amenities.includes(amenity.code)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          amenities: event.target.checked
                            ? [...current.amenities, amenity.code]
                            : current.amenities.filter((code) => code !== amenity.code)
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </CheckboxGroup>
          </div>
        </div>

        <Button type="submit" className="w-full">
          Áp dụng bộ lọc
        </Button>
      </div>
    </form>
  );
}
