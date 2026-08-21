"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Amenity, PropertyType, PublicListingSort } from "../../types/api";
import { searchFilterValues, type SearchFilterValues, type SearchQueryState } from "./search-query";

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

type AreaPreset = "all" | "under20" | "20-30" | "30-50" | "over50";

function detectAreaPreset(min?: number, max?: number): AreaPreset {
  if (min === undefined && max === undefined) return "all";
  if (min === undefined && max === 20) return "under20";
  if (min === 20 && max === 30) return "20-30";
  if (min === 30 && max === 50) return "30-50";
  if (min === 50 && max === undefined) return "over50";
  return "all";
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
  const values = useMemo(() => searchFilterValues(committed), [committed]);

  const [keyword, setKeyword] = useState(values.q ?? "");
  const [propertyType, setPropertyType] = useState(values.propertyType ?? "");
  const [maxRentMillion, setMaxRentMillion] = useState<number>(() => {
    if (values.maxMonthlyRent !== undefined) {
      return Math.min(Math.max(Math.round(values.maxMonthlyRent / 1000000), 1), 30);
    }
    return 30;
  });
  const [hasPriceFilter, setHasPriceFilter] = useState(values.maxMonthlyRent !== undefined);
  const [areaPreset, setAreaPreset] = useState<AreaPreset>(() =>
    detectAreaPreset(values.minRoomAreaSqm, values.maxRoomAreaSqm)
  );
  const [areaName, setAreaName] = useState(values.areaName ?? "");

  useEffect(() => {
    const fresh = searchFilterValues(committed);
    setKeyword(fresh.q ?? "");
    setPropertyType(fresh.propertyType ?? "");
    if (fresh.maxMonthlyRent !== undefined) {
      setMaxRentMillion(Math.min(Math.max(Math.round(fresh.maxMonthlyRent / 1000000), 1), 30));
      setHasPriceFilter(true);
    } else {
      setMaxRentMillion(30);
      setHasPriceFilter(false);
    }
    setAreaPreset(detectAreaPreset(fresh.minRoomAreaSqm, fresh.maxRoomAreaSqm));
    setAreaName(fresh.areaName ?? "");
  }, [committed]);

  const handleReset = () => {
    setKeyword("");
    setPropertyType("");
    setMaxRentMillion(30);
    setHasPriceFilter(false);
    setAreaPreset("all");
    setAreaName("");
    onClear();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let minRoomAreaSqm: number | undefined;
    let maxRoomAreaSqm: number | undefined;

    if (areaPreset === "under20") {
      maxRoomAreaSqm = 20;
    } else if (areaPreset === "20-30") {
      minRoomAreaSqm = 20;
      maxRoomAreaSqm = 30;
    } else if (areaPreset === "30-50") {
      minRoomAreaSqm = 30;
      maxRoomAreaSqm = 50;
    } else if (areaPreset === "over50") {
      minRoomAreaSqm = 50;
    }

    const filterValues: SearchFilterValues = {
      ...(keyword.trim() ? { q: keyword.trim() } : {}),
      ...(areaName.trim() ? { areaName: areaName.trim() } : {}),
      ...(hasPriceFilter && maxRentMillion < 30 ? { maxMonthlyRent: maxRentMillion * 1000000 } : {}),
      ...(minRoomAreaSqm !== undefined ? { minRoomAreaSqm } : {}),
      ...(maxRoomAreaSqm !== undefined ? { maxRoomAreaSqm } : {}),
      ...(propertyType ? { propertyType } : {}),
      amenities: []
    };

    onApply(filterValues, committed.sort);
  };

  return (
    <aside className="w-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sticky top-24 space-y-6">
      {/* Filter Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <svg aria-hidden="true" className="h-5 w-5 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.586a1 1 0 0 1-.293.707l-6.414 6.414a1 1 0 0 0-.293.707V17l-4 4v-6.586a1 1 0 0 0-.293-.707L3.293 7.293A1 1 0 0 1 3 6.586V4Z" />
          </svg>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Bộ lọc</h2>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 rounded-full border border-brandBlue-500/30 px-3 py-1 text-xs font-bold text-brandBlue-600 transition-colors hover:bg-brandBlue-50"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>Đặt lại</span>
        </button>
      </div>

      {/* Filter Form */}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* 1. TỪ KHÓA */}
        <div>
          <label htmlFor="filter-keyword" className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-400">
            TỪ KHÓA
          </label>
          <div className="relative">
            <svg aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              id="filter-keyword"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Địa chỉ, tên phòng..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-brandBlue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* 2. LOẠI PHÒNG */}
        <div>
          <label className="mb-2.5 block text-[11px] font-black uppercase tracking-wider text-slate-400">
            LOẠI PHÒNG
          </label>
          <div className="space-y-2 text-sm font-medium text-slate-700">
            <label className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
              <input
                type="radio"
                name="propertyTypeOption"
                checked={propertyType === ""}
                onChange={() => setPropertyType("")}
                className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
              />
              <span>Tất cả loại phòng</span>
            </label>
            {propertyTypes.status === "loading" ? (
              <p className="text-xs text-slate-400 animate-pulse">Đang tải loại hình…</p>
            ) : propertyTypes.status === "error" ? (
              <div className="text-xs text-rose-600">
                <span>Lỗi tải loại hình. </span>
                <button type="button" onClick={onRetryPropertyTypes} className="font-bold underline">Thử lại</button>
              </div>
            ) : (
              propertyTypes.data.map((type) => (
                <label key={type.code} className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
                  <input
                    type="radio"
                    name="propertyTypeOption"
                    checked={propertyType === type.code}
                    onChange={() => setPropertyType(type.code)}
                    className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
                  />
                  <span>{type.label}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* 3. KHOẢNG GIÁ */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="filter-price-slider" className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              KHOẢNG GIÁ
            </label>
            <span className="text-xs font-bold text-brandBlue-600">
              {!hasPriceFilter || maxRentMillion >= 30 ? "Tất cả mức giá" : `Tối đa ${maxRentMillion}tr/tháng`}
            </span>
          </div>
          <input
            id="filter-price-slider"
            type="range"
            min="1"
            max="30"
            step="1"
            value={maxRentMillion}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMaxRentMillion(val);
              setHasPriceFilter(val < 30);
            }}
            className="w-full cursor-pointer accent-brandBlue-500"
          />
          <div className="mt-1.5 flex justify-between text-xs font-semibold text-slate-400">
            <span>1tr</span>
            <span>15tr</span>
            <span>30tr+</span>
          </div>
        </div>

        {/* 4. DIỆN TÍCH */}
        <div>
          <label className="mb-2.5 block text-[11px] font-black uppercase tracking-wider text-slate-400">
            DIỆN TÍCH
          </label>
          <div className="space-y-2 text-sm font-medium text-slate-700">
            <label className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
              <input
                type="radio"
                name="areaPresetGroup"
                value="all"
                checked={areaPreset === "all"}
                onChange={() => setAreaPreset("all")}
                className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
              />
              <span>Tất cả diện tích</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
              <input
                type="radio"
                name="areaPresetGroup"
                value="under20"
                checked={areaPreset === "under20"}
                onChange={() => setAreaPreset("under20")}
                className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
              />
              <span>Dưới 20 m²</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
              <input
                type="radio"
                name="areaPresetGroup"
                value="20-30"
                checked={areaPreset === "20-30"}
                onChange={() => setAreaPreset("20-30")}
                className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
              />
              <span>20 - 30 m²</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
              <input
                type="radio"
                name="areaPresetGroup"
                value="30-50"
                checked={areaPreset === "30-50"}
                onChange={() => setAreaPreset("30-50")}
                className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
              />
              <span>30 - 50 m²</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 transition-colors hover:text-brandBlue-600">
              <input
                type="radio"
                name="areaPresetGroup"
                value="over50"
                checked={areaPreset === "over50"}
                onChange={() => setAreaPreset("over50")}
                className="h-4 w-4 text-brandBlue-500 border-slate-300 focus:ring-brandBlue-500"
              />
              <span>Trên 50 m²</span>
            </label>
          </div>
        </div>

        {/* 5. KHU VỰC / TỈNH THÀNH */}
        <div>
          <label htmlFor="filter-areaname" className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-400">
            KHU VỰC / TỈNH THÀNH
          </label>
          <div className="relative">
            <input
              id="filter-areaname"
              type="text"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="Ví dụ: Quận 1, Gò Vấp, Thủ Đức..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-brandBlue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brandBlue-500 to-sky-500 py-3.5 px-4 text-sm font-extrabold text-white shadow-md shadow-brandBlue-500/25 transition-all hover:from-brandBlue-600 hover:to-sky-600 hover:scale-[1.02] active:scale-95"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <span>Tìm kiếm</span>
        </button>
      </form>
    </aside>
  );
}

