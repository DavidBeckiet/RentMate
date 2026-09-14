"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../../components/ui/icon";
import { formatAreaLabel, rentMateAreaCatalog } from "../../lib/area";
import type { PropertyType } from "../../types/api";
import type { SearchFilterValues } from "./search-query";
import { propertyTypeLabel } from "./room-type-label";
import styles from "./hero-search.module.css";

export interface HeroSearchProps {
  readonly propertyTypes: readonly PropertyType[];
  readonly loading?: boolean;
  readonly onSearch: (filters: SearchFilterValues) => void;
}

const suggestionKeys = new Set(["binh-thanh", "quan-3", "phu-nhuan"]);
const suggestions = rentMateAreaCatalog.filter((area) => suggestionKeys.has(area.key)).map((area) => area.label);

interface BudgetOption {
  readonly value: string;
  readonly label: string;
  readonly minMonthlyRent?: number;
  readonly maxMonthlyRent?: number;
}

const budgetOptions: readonly BudgetOption[] = [
  { value: "", label: "Tất cả ngân sách" },
  { value: "under-3m", label: "Dưới 3 triệu", maxMonthlyRent: 2_999_999 },
  { value: "3-5m", label: "3–5 triệu", minMonthlyRent: 3_000_000, maxMonthlyRent: 5_000_000 },
  { value: "5-8m", label: "5–8 triệu", minMonthlyRent: 5_000_001, maxMonthlyRent: 8_000_000 },
  { value: "8-12m", label: "8–12 triệu", minMonthlyRent: 8_000_001, maxMonthlyRent: 12_000_000 },
  { value: "over-12m", label: "Trên 12 triệu", minMonthlyRent: 12_000_001 }
];

export function HeroSearch({ propertyTypes, loading = false, onSearch }: HeroSearchProps) {
  const [area, setArea] = useState("");
  const [budget, setBudget] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    const normalizedArea = area.trim() ? formatAreaLabel(area) : "";
    const selectedBudget = budgetOptions.find((option) => option.value === budget) ?? budgetOptions[0];

    onSearch({
      ...(normalizedArea ? { areaName: normalizedArea } : {}),
      ...(selectedBudget.minMonthlyRent === undefined ? {} : { minMonthlyRent: selectedBudget.minMonthlyRent }),
      ...(selectedBudget.maxMonthlyRent === undefined ? {} : { maxMonthlyRent: selectedBudget.maxMonthlyRent }),
      ...(propertyType ? { propertyType } : {}),
      amenities: []
    });
  };

  const chooseArea = (value: string) => {
    const normalizedArea = formatAreaLabel(value);
    setArea(normalizedArea);
  };

  return (
    <div className={styles.shell}>
      <div className={styles.searchIntro}>
        <div>
          <p className={styles.searchEyebrow}>BẮT ĐẦU TỪ NHU CẦU CỦA BẠN</p>
          <h2 className={styles.searchTitle}>Tìm một nơi để gọi là nhà.</h2>
        </div>
        <p className={styles.searchHint}>Chọn khu vực, ngân sách và kiểu phòng bạn cần.</p>
      </div>

      <form onSubmit={submit} noValidate aria-labelledby="hero-search-heading">
        <h3 id="hero-search-heading" className="sr-only">
          Tìm phòng theo khu vực, ngân sách và loại hình
        </h3>
        <div className={styles.searchGrid}>
          <label className={styles.field} htmlFor="hero-search-area">
            <span className={styles.fieldIcon} aria-hidden="true">
              <Icon name="pin" className="h-5 w-5" />
            </span>
            <span className={styles.fieldBody}>
              <span className={styles.fieldLabel}>Khu vực</span>
              <input
                id="hero-search-area"
                name="areaName"
                aria-label="Khu vực"
                value={area}
                onChange={(event) => setArea(event.currentTarget.value)}
                placeholder="Quận, thành phố..."
                autoComplete="off"
                className={styles.textInput}
              />
            </span>
          </label>

          <label className={styles.field} htmlFor="hero-search-budget">
            <span className={styles.fieldIcon} aria-hidden="true">
              <Icon name="target" className="h-5 w-5" />
            </span>
            <span className={styles.fieldBody}>
              <span className={styles.fieldLabel}>Ngân sách mỗi tháng</span>
              <select
                id="hero-search-budget"
                name="budget"
                aria-label="Ngân sách mỗi tháng"
                value={budget}
                onChange={(event) => setBudget(event.currentTarget.value)}
                className={styles.selectInput}
              >
                {budgetOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className={styles.field} htmlFor="hero-search-property-type">
            <span className={styles.fieldIcon} aria-hidden="true">
              <Icon name="building" className="h-5 w-5" />
            </span>
            <span className={styles.fieldBody}>
              <span className={styles.fieldLabel}>Loại phòng</span>
              <select
                id="hero-search-property-type"
                name="propertyType"
                aria-label="Loại phòng"
                value={propertyType}
                disabled={loading}
                onChange={(event) => setPropertyType(event.currentTarget.value)}
                className={styles.selectInput}
              >
                <option value="">Tất cả loại phòng</option>
                {propertyTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {propertyTypeLabel(type)}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
            aria-busy={submitting || undefined}
          >
            <span>{submitting ? "Đang mở tìm kiếm…" : "Tìm phòng"}</span>
            <Icon name="arrow" className="h-5 w-5" />
          </button>
        </div>
      </form>

      <div className={styles.quickRow}>
        <span className={styles.quickLabel}>Khu vực phổ biến</span>
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => chooseArea(suggestion)} className={styles.suggestion}>
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
