"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../../components/ui/icon";
import type { PropertyType } from "../../types/api";
import type { SearchFilterValues } from "./search-query";
import { propertyTypeLabel } from "./room-type-label";
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
  const [submitting, setSubmitting] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    onSearch({
      ...(keyword.trim() ? { q: keyword.trim() } : {}),
      ...(propertyType ? { propertyType } : {}),
      amenities: []
    });
  };

  const chooseSuggestion = (suggestion: string) => {
    setKeyword(suggestion);
    setSubmitting(true);
    onSearch({ q: suggestion, amenities: [] });
  };

  return (
    <div className={styles.shell}>
      <div className={styles.searchIntro}>
        <div>
          <p className={styles.searchEyebrow}>TÌM CHỖ Ở</p>
          <h2 className={styles.searchTitle}>Bạn muốn sống ở đâu?</h2>
        </div>
        <p className={styles.searchHint}>Lọc theo khu vực và kiểu phòng.</p>
      </div>
      <form onSubmit={submit} noValidate aria-label="Tìm kiếm phòng">
        <div className={styles.searchGrid}>
          <label className={styles.field}>
            <span className={styles.fieldIcon} aria-hidden="true">
              <Icon name="search" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={styles.fieldLabel}>Khu vực hoặc tên phòng</span>
              <input
                id="hero-search-keyword"
                name="q"
                value={keyword}
                onChange={(event) => setKeyword(event.currentTarget.value)}
                placeholder="Nhập khu vực, quận hoặc địa điểm..."
                className={styles.textInput}
              />
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldIcon} aria-hidden="true">
              <Icon name="building" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={styles.fieldLabel}>Kiểu không gian</span>
              <select
                id="hero-search-property-type"
                name="propertyType"
                value={propertyType}
                disabled={loading}
                onChange={(event) => setPropertyType(event.currentTarget.value)}
                className={styles.selectInput}
              >
                <option value="">Tất cả loại hình</option>
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
            className={`${styles.submitButton} group`}
            disabled={submitting}
            aria-busy={submitting || undefined}
          >
            <span>{submitting ? "Đang mở tìm kiếm…" : "Tìm phòng"}</span>
            <Icon name="arrow" className="h-5 w-5 transition-transform group-hover:translate-x-1.5" />
          </button>
        </div>
      </form>

      <div className={styles.quickRow}>
        <span className={styles.quickLabel}>Tìm nhanh</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => chooseSuggestion(suggestion)}
            className={styles.suggestion}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
