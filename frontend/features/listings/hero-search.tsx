"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../../components/ui/icon";
import type { PropertyType } from "../../types/api";
import type { SearchFilterValues } from "./search-query";
import styles from "./hero-search.module.css";

export interface HeroSearchProps {
  readonly propertyTypes: readonly PropertyType[];
  readonly loading?: boolean;
  readonly onSearch: (filters: SearchFilterValues) => void;
}

const suggestions = ["Thảo Điền", "Bình Thạnh", "Phú Nhuận"];

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

  const chooseSuggestion = (suggestion: string) => {
    setKeyword(suggestion);
    onSearch({ q: suggestion, amenities: [] });
  };

  return (
    <div className={styles.shell}>
      <form onSubmit={submit} noValidate>
        <div className={styles.searchGrid}>
          <label className={`${styles.field} flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5`}>
            <Icon name="search" className="h-6 w-6 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[10px] font-bold uppercase tracking-[0.17em] text-rent-subtle">
                Bạn muốn sống ở đâu?
              </span>
              <input
                id="hero-search-keyword"
                name="q"
                value={keyword}
                onChange={(event) => setKeyword(event.currentTarget.value)}
                placeholder="Nhập khu vực hoặc tên phòng"
                className="mt-0.5 min-h-8 w-full border-0 bg-transparent p-0 font-display text-base font-bold text-heroDark-950 outline-none placeholder:text-rent-subtle sm:text-lg"
              />
            </span>
          </label>

          <label className={`${styles.field} flex items-center gap-3 px-4 py-3 sm:px-5`}>
            <Icon name="building" className="h-6 w-6 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[10px] font-bold uppercase tracking-[0.17em] text-rent-subtle">
                Kiểu không gian
              </span>
              <select
                id="hero-search-property-type"
                name="propertyType"
                value={propertyType}
                disabled={loading}
                onChange={(event) => setPropertyType(event.currentTarget.value)}
                className="mt-0.5 min-h-8 w-full border-0 bg-transparent p-0 font-display text-base font-bold text-heroDark-950 outline-none"
              >
                <option value="">Tất cả loại hình</option>
                {propertyTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <button
            type="submit"
            className="group inline-flex min-h-16 items-center justify-center gap-2 border-t-2 border-heroDark-950 bg-rent-accent px-6 font-display text-base font-bold text-heroDark-950 transition-colors hover:bg-rent-coral focus-visible:outline-none md:min-h-full md:border-l-2 md:border-t-0"
          >
            Khám phá
            <Icon name="arrow" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-heroDark-950 bg-[#e5eefc] px-4 py-3 text-xs sm:px-5">
        <span className="font-display font-bold uppercase tracking-[0.12em]">Đi nhanh:</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => chooseSuggestion(suggestion)}
            className="border-b-2 border-heroDark-950/35 font-bold transition-colors hover:border-rent-coral hover:text-brandBlue-600"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
