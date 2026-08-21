"use client";

import { useState, type FormEvent } from "react";
import type { PropertyType } from "../../types/api";
import type { SearchFilterValues } from "./search-query";
import styles from "./hero-search.module.css";

export interface HeroSearchProps {
  readonly propertyTypes: readonly PropertyType[];
  readonly loading?: boolean;
  readonly onSearch: (filters: SearchFilterValues) => void;
}

export function HeroSearch({ propertyTypes, loading = false, onSearch }: HeroSearchProps) {
  const [keyword, setKeyword] = useState("");
  const [propertyType, setPropertyType] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch({
      ...(keyword.trim() ? { q: keyword.trim() } : {}),
      ...(propertyType ? { propertyType } : {}),
      amenities: []
    });
  };

  return (
    <form
      onSubmit={submit}
      className={styles.search}
      noValidate
    >
      <div className="relative flex items-center min-w-0 px-3 py-1">
        <svg
          aria-hidden="true"
          className="mr-3 h-5 w-5 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <div className="flex-1">
          <label htmlFor="hero-search-keyword" className="sr-only">Khu vực hoặc tên phòng</label>
          <input
            id="hero-search-keyword"
            name="q"
            value={keyword}
            onChange={(event) => setKeyword(event.currentTarget.value)}
            placeholder="Nhập địa chỉ, quận, tỉnh thành..."
            className="min-h-12 w-full border-0 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:ring-0"
          />
        </div>
      </div>

      <div className="relative border-t border-slate-800 px-3 py-1 sm:border-l sm:border-t-0 sm:border-slate-800">
        <label htmlFor="hero-search-property-type" className="sr-only">Loại hình</label>
        <select
          id="hero-search-property-type"
          name="propertyType"
          value={propertyType}
          disabled={loading}
          onChange={(event) => setPropertyType(event.currentTarget.value)}
          className="min-h-12 w-full cursor-pointer border-0 bg-transparent text-sm font-semibold text-slate-200 outline-none focus:ring-0"
        >
          <option value="">Tất cả loại hình</option>
          {propertyTypes.map((type) => (
            <option key={type.code} value={type.code}>{type.label}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-7 py-3 text-sm font-extrabold text-white shadow-md transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-sky-600 hover:shadow-lg active:translate-y-0 sm:w-auto"
      >
        <span>Tìm kiếm</span>
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </button>
      <div className="flex flex-wrap items-center gap-2 px-2 pt-1 text-[11px] text-slate-400 sm:col-span-3">
        <span className="font-bold text-slate-300">Gợi ý:</span>
        {["TP. Hồ Chí Minh", "Hà Nội", "Bình Dương", "Cần Thơ"].map((location) => (
          <button key={location} type="button" onClick={() => setKeyword(location)} className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-slate-300 transition hover:border-sky-500 hover:text-white">
            {location}
          </button>
        ))}
      </div>
    </form>
  );
}
