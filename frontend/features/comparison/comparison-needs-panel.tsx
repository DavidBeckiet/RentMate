"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { formatAreaLabel } from "../../lib/area";
import type { Amenity, PropertyType, SavedSearch } from "../../types/api";
import {
  amenityLabel,
  amenityLabelForCode,
  propertyTypeLabel,
  propertyTypeLabelForCode
} from "../listings/room-type-label";
import { savedSearchCriteria, savedSearchTitle } from "../saved-searches/saved-search-presentation";
import { normalizeComparisonNeeds, type ComparisonNeeds } from "./comparison-needs-evaluator";
import type { ComparisonNeedsSnapshot } from "./comparison-needs-state";
import styles from "./compare-page.module.css";

type SourceChoice = "none" | "saved" | "manual";

interface ManualForm {
  areaName: string;
  minMonthlyRent: string;
  maxMonthlyRent: string;
  propertyType: string;
  minRoomAreaSqm: string;
  maxRoomAreaSqm: string;
  minOccupants: string;
  amenities: readonly string[];
}

interface LookupState<T> {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly data: readonly T[];
}

const emptyLookup = <T,>(): LookupState<T> => ({ status: "idle", data: [] });

function formFromNeeds(needs: ComparisonNeeds | null): ManualForm {
  return {
    areaName: needs?.areaName ?? "",
    minMonthlyRent: needs?.minMonthlyRent === undefined ? "" : String(needs.minMonthlyRent),
    maxMonthlyRent: needs?.maxMonthlyRent === undefined ? "" : String(needs.maxMonthlyRent),
    propertyType: needs?.propertyType ?? "",
    minRoomAreaSqm: needs?.minRoomAreaSqm === undefined ? "" : String(needs.minRoomAreaSqm),
    maxRoomAreaSqm: needs?.maxRoomAreaSqm === undefined ? "" : String(needs.maxRoomAreaSqm),
    minOccupants: needs?.minOccupants === undefined ? "" : String(needs.minOccupants),
    amenities: needs?.amenities ?? []
  };
}

function parsePositive(value: string, label: string, errors: string[]): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(`${label} phải lớn hơn 0.`);
    return undefined;
  }
  return parsed;
}

function needsFromManualForm(form: ManualForm): { needs: ComparisonNeeds | null; error: string | null } {
  const errors: string[] = [];
  const minMonthlyRent = parsePositive(form.minMonthlyRent, "Giá từ", errors);
  const maxMonthlyRent = parsePositive(form.maxMonthlyRent, "Giá đến", errors);
  const minRoomAreaSqm = parsePositive(form.minRoomAreaSqm, "Diện tích từ", errors);
  const maxRoomAreaSqm = parsePositive(form.maxRoomAreaSqm, "Diện tích đến", errors);
  const minOccupants = parsePositive(form.minOccupants, "Số người", errors);
  if (minMonthlyRent !== undefined && maxMonthlyRent !== undefined && minMonthlyRent > maxMonthlyRent) {
    errors.push("Giá từ không được lớn hơn giá đến.");
  }
  if (minRoomAreaSqm !== undefined && maxRoomAreaSqm !== undefined && minRoomAreaSqm > maxRoomAreaSqm) {
    errors.push("Diện tích từ không được lớn hơn diện tích đến.");
  }
  if (errors.length > 0) return { needs: null, error: errors[0]! };
  return {
    needs: normalizeComparisonNeeds({
      areaName: form.areaName,
      minMonthlyRent,
      maxMonthlyRent,
      propertyType: form.propertyType,
      minRoomAreaSqm,
      maxRoomAreaSqm,
      minOccupants,
      amenities: form.amenities
    }),
    error: null
  };
}

function formatNeedsSummary(needs: ComparisonNeeds): readonly string[] {
  const summary: string[] = [];
  if (needs.areaName) summary.push(formatAreaLabel(needs.areaName));
  if (needs.minMonthlyRent !== undefined && needs.maxMonthlyRent !== undefined) {
    summary.push(
      needs.minMonthlyRent === needs.maxMonthlyRent
        ? `${needs.minMonthlyRent.toLocaleString("vi-VN")} ₫/tháng`
        : `${needs.minMonthlyRent.toLocaleString("vi-VN")}–${needs.maxMonthlyRent.toLocaleString("vi-VN")} ₫/tháng`
    );
  } else if (needs.maxMonthlyRent !== undefined) {
    summary.push(`≤ ${needs.maxMonthlyRent.toLocaleString("vi-VN")} ₫/tháng`);
  } else if (needs.minMonthlyRent !== undefined) {
    summary.push(`Từ ${needs.minMonthlyRent.toLocaleString("vi-VN")} ₫/tháng`);
  }
  if (needs.propertyType) {
    const propertyLabel = propertyTypeLabelForCode(needs.propertyType);
    if (propertyLabel) summary.push(propertyLabel);
  }
  if (needs.minRoomAreaSqm !== undefined && needs.maxRoomAreaSqm !== undefined) {
    summary.push(`${needs.minRoomAreaSqm}–${needs.maxRoomAreaSqm} m²`);
  } else if (needs.minRoomAreaSqm !== undefined) {
    summary.push(`Từ ${needs.minRoomAreaSqm} m²`);
  } else if (needs.maxRoomAreaSqm !== undefined) {
    summary.push(`≤ ${needs.maxRoomAreaSqm} m²`);
  }
  if (needs.minOccupants !== undefined) summary.push(`Từ ${needs.minOccupants} người`);
  needs.amenities.forEach((code) => {
    const label = amenityLabelForCode(code);
    if (label) summary.push(label);
  });
  if (needs.q) summary.push(`Từ khóa: ${needs.q}`);
  return Object.freeze(summary);
}

function sourceFromSnapshot(snapshot: ComparisonNeedsSnapshot | null): SourceChoice {
  return snapshot?.source ?? "none";
}

export function ComparisonNeedsPanel({
  snapshot,
  canUseSavedSearch,
  authResolved,
  onApplyManual,
  onApplySaved,
  onClear
}: Readonly<{
  snapshot: ComparisonNeedsSnapshot | null;
  canUseSavedSearch: boolean;
  authResolved: boolean;
  onApplyManual: (needs: ComparisonNeeds) => void;
  onApplySaved: (search: SavedSearch) => void;
  onClear: () => void;
}>) {
  const [choice, setChoice] = useState<SourceChoice>(() => sourceFromSnapshot(snapshot));
  const [manualForm, setManualForm] = useState<ManualForm>(() =>
    formFromNeeds(snapshot?.source === "manual" ? snapshot.criteria : null)
  );
  const [manualError, setManualError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<readonly SavedSearch[]>([]);
  const [savedState, setSavedState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [savedRetryKey, setSavedRetryKey] = useState(0);
  const [savedSelection, setSavedSelection] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<LookupState<PropertyType>>(emptyLookup);
  const [amenities, setAmenities] = useState<LookupState<Amenity>>(emptyLookup);
  const [lookupRetryKey, setLookupRetryKey] = useState(0);

  useEffect(() => {
    const nextChoice = sourceFromSnapshot(snapshot);
    setChoice(nextChoice);
    if (snapshot?.source === "manual") setManualForm(formFromNeeds(snapshot.criteria));
    if (snapshot?.source === "saved") setSavedSelection(snapshot.sourceId ? String(snapshot.sourceId) : "");
    if (!snapshot) setSavedSelection("");
  }, [snapshot]);

  useEffect(() => {
    if (authResolved && !canUseSavedSearch && choice === "saved") {
      setChoice("none");
      onClear();
    }
  }, [authResolved, canUseSavedSearch, choice, onClear]);

  useEffect(() => {
    if (!canUseSavedSearch || choice !== "saved") return;
    const controller = new AbortController();
    setSavedState("loading");
    void api.savedSearches
      .list({ page: 1, pageSize: 50 }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setSavedSearches(page.data);
        setSavedState("success");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSavedState(error instanceof ApiError ? "error" : "error");
      });
    return () => controller.abort();
  }, [canUseSavedSearch, choice, savedRetryKey]);

  useEffect(() => {
    if (choice !== "manual") return;
    const controller = new AbortController();
    setPropertyTypes((current) => ({ ...current, status: "loading" }));
    setAmenities((current) => ({ ...current, status: "loading" }));
    void Promise.allSettled([
      api.lookups.listPropertyTypes(controller.signal),
      api.lookups.listAmenities(controller.signal)
    ]).then(([propertyResult, amenityResult]) => {
      if (controller.signal.aborted) return;
      setPropertyTypes(
        propertyResult.status === "fulfilled"
          ? { status: "success", data: propertyResult.value }
          : { status: "error", data: [] }
      );
      setAmenities(
        amenityResult.status === "fulfilled"
          ? { status: "success", data: amenityResult.value }
          : { status: "error", data: [] }
      );
    });
    return () => controller.abort();
  }, [choice, lookupRetryKey]);

  const summary = useMemo(() => (snapshot ? formatNeedsSummary(snapshot.criteria) : []), [snapshot]);
  const selectedSavedSearch = savedSearches.find((item) => String(item.id) === savedSelection);
  const savedSelectionMissing =
    snapshot?.source === "saved" && savedState === "success" && snapshot.sourceId !== undefined && !selectedSavedSearch;

  const selectChoice = (next: SourceChoice) => {
    setChoice(next);
    setManualError(null);
    if (next === "none") {
      onClear();
      return;
    }
    if (next === "manual") {
      setManualForm(formFromNeeds(snapshot?.source === "manual" ? snapshot.criteria : null));
      return;
    }
    setSavedSelection(snapshot?.source === "saved" && snapshot.sourceId ? String(snapshot.sourceId) : "");
  };

  const applyManual = () => {
    const parsed = needsFromManualForm(manualForm);
    if (parsed.error || !parsed.needs) {
      setManualError(parsed.error ?? "Hãy chọn ít nhất một nhu cầu.");
      return;
    }
    setManualError(null);
    onApplyManual(parsed.needs);
  };

  return (
    <section className={styles.needsPanel} aria-labelledby="comparison-needs-heading">
      <div className={styles.needsPanelHeader}>
        <div>
          <h2 id="comparison-needs-heading" className={styles.sectionTitle}>
            So sánh theo nhu cầu
          </h2>
          <p className={styles.sectionDescription}>
            Chỉ dùng tiêu chí bạn chủ động chọn; không có điểm số hay xếp hạng tự động.
          </p>
        </div>
        {snapshot ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            <Icon name="close" className="h-4 w-4" /> Bỏ nhu cầu
          </Button>
        ) : null}
      </div>

      <label className={styles.needsSourceLabel} htmlFor="comparison-needs-source">
        Nguồn nhu cầu
      </label>
      <select
        id="comparison-needs-source"
        value={choice}
        onChange={(event) => selectChoice(event.target.value as SourceChoice)}
        className={styles.needsSelect}
      >
        <option value="none">Không áp dụng nhu cầu · chỉ so sánh thông tin</option>
        {canUseSavedSearch || (!authResolved && choice === "saved") ? (
          <option value="saved">Bộ lọc đã lưu của tôi</option>
        ) : null}
        <option value="manual">Thiết lập nhu cầu riêng</option>
      </select>

      {!canUseSavedSearch && choice !== "manual" ? (
        <p className={styles.needsHint}>
          Bộ lọc đã lưu chỉ dành cho tài khoản người thuê. Bạn vẫn có thể thiết lập nhu cầu riêng.
        </p>
      ) : null}

      {choice === "saved" ? (
        <div className={styles.needsSourceBody}>
          <label className={styles.needsSourceLabel} htmlFor="comparison-saved-search">
            Chọn bộ lọc đã lưu
          </label>
          <select
            id="comparison-saved-search"
            value={savedSelection}
            disabled={savedState === "loading"}
            onChange={(event) => {
              const selected = savedSearches.find((item) => String(item.id) === event.target.value);
              setSavedSelection(event.target.value);
              if (selected) onApplySaved(selected);
            }}
            className={styles.needsSelect}
          >
            <option value="">{savedState === "loading" ? "Đang tải bộ lọc đã lưu…" : "Chọn một bộ lọc đã lưu"}</option>
            {snapshot?.source === "saved" && snapshot.sourceId && savedSelectionMissing ? (
              <option value={String(snapshot.sourceId)}>{snapshot.sourceLabel ?? "Nhu cầu đã chọn"}</option>
            ) : null}
            {savedSearches.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {savedSearchTitle(item)}
              </option>
            ))}
          </select>
          {savedState === "error" ? (
            <div className={styles.needsInlineError} role="alert">
              <span>Không tải được bộ lọc đã lưu. So sánh thông tin vẫn hoạt động.</span>
              <Button variant="outline" size="sm" onClick={() => setSavedRetryKey((value) => value + 1)}>
                Thử lại
              </Button>
            </div>
          ) : null}
          {savedSelectionMissing ? (
            <p className={styles.needsWarning} role="status">
              Bộ lọc đã chọn không còn khả dụng. Các tiêu chí đã áp dụng vẫn được giữ; bạn có thể chọn bộ lọc khác.
            </p>
          ) : null}
          {selectedSavedSearch ? (
            <div className={styles.needsSavedMeta}>
              <strong>{savedSearchTitle(selectedSavedSearch)}</strong>
              <span>
                {savedSearchCriteria(selectedSavedSearch.query)
                  .filter(
                    (item) =>
                      !item.startsWith("Gần nhất") && !item.startsWith("Bán kính") && item !== "Vùng bản đồ đã chọn"
                  )
                  .join(" · ")}
              </span>
              {selectedSavedSearch.query.mode !== "ordinary" ? (
                <span>Tiêu chí vị trí bản đồ hiện chưa được dùng trong so sánh này.</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {choice === "manual" ? (
        <div className={styles.manualNeedsForm}>
          <div className={styles.manualField}>
            <label htmlFor="comparison-area">Khu vực</label>
            <input
              id="comparison-area"
              value={manualForm.areaName}
              onChange={(event) => setManualForm((current) => ({ ...current, areaName: event.target.value }))}
              placeholder="Ví dụ: Quận 3"
            />
          </div>
          <div className={styles.manualFieldGroup}>
            <div className={styles.manualField}>
              <label htmlFor="comparison-min-rent">Ngân sách từ</label>
              <input
                id="comparison-min-rent"
                inputMode="numeric"
                type="number"
                min="1"
                value={manualForm.minMonthlyRent}
                onChange={(event) => setManualForm((current) => ({ ...current, minMonthlyRent: event.target.value }))}
                placeholder="Không giới hạn"
              />
            </div>
            <div className={styles.manualField}>
              <label htmlFor="comparison-max-rent">Ngân sách đến</label>
              <input
                id="comparison-max-rent"
                inputMode="numeric"
                type="number"
                min="1"
                value={manualForm.maxMonthlyRent}
                onChange={(event) => setManualForm((current) => ({ ...current, maxMonthlyRent: event.target.value }))}
                placeholder="Không giới hạn"
              />
            </div>
          </div>
          <div className={styles.manualField}>
            <label htmlFor="comparison-property-type">Loại phòng</label>
            <select
              id="comparison-property-type"
              value={manualForm.propertyType}
              onChange={(event) => setManualForm((current) => ({ ...current, propertyType: event.target.value }))}
              disabled={propertyTypes.status === "loading"}
            >
              <option value="">Không giới hạn</option>
              {propertyTypes.data.map((item) => (
                <option key={item.code} value={item.code}>
                  {propertyTypeLabel(item)}
                </option>
              ))}
            </select>
            {propertyTypes.status === "error" ? (
              <span className={styles.fieldHint}>Không tải được danh sách loại phòng.</span>
            ) : null}
          </div>
          <div className={styles.manualFieldGroup}>
            <div className={styles.manualField}>
              <label htmlFor="comparison-min-area">Diện tích từ</label>
              <input
                id="comparison-min-area"
                inputMode="decimal"
                type="number"
                min="1"
                step="0.01"
                value={manualForm.minRoomAreaSqm}
                onChange={(event) => setManualForm((current) => ({ ...current, minRoomAreaSqm: event.target.value }))}
                placeholder="Không giới hạn"
              />
            </div>
            <div className={styles.manualField}>
              <label htmlFor="comparison-max-area">Diện tích đến</label>
              <input
                id="comparison-max-area"
                inputMode="decimal"
                type="number"
                min="1"
                step="0.01"
                value={manualForm.maxRoomAreaSqm}
                onChange={(event) => setManualForm((current) => ({ ...current, maxRoomAreaSqm: event.target.value }))}
                placeholder="Không giới hạn"
              />
            </div>
          </div>
          <div className={styles.manualField}>
            <label htmlFor="comparison-min-occupants">Số người tối thiểu</label>
            <input
              id="comparison-min-occupants"
              inputMode="numeric"
              type="number"
              min="1"
              max="20"
              value={manualForm.minOccupants}
              onChange={(event) => setManualForm((current) => ({ ...current, minOccupants: event.target.value }))}
              placeholder="Không giới hạn"
            />
          </div>
          <fieldset className={styles.manualFieldset}>
            <legend>Tiện ích bắt buộc</legend>
            {amenities.status === "loading" ? <p className={styles.fieldHint}>Đang tải tiện ích…</p> : null}
            {amenities.status === "error" ? (
              <p className={styles.fieldHint}>Không tải được danh sách tiện ích.</p>
            ) : null}
            <div className={styles.amenityChoices}>
              {amenities.data.map((item) => (
                <label key={item.code} className={styles.amenityChoice}>
                  <input
                    type="checkbox"
                    checked={manualForm.amenities.includes(item.code)}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        amenities: event.target.checked
                          ? [...current.amenities, item.code]
                          : current.amenities.filter((code) => code !== item.code)
                      }))
                    }
                  />
                  <span>{amenityLabel(item)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {manualError ? (
            <p className={styles.needsInlineError} role="alert">
              {manualError}
            </p>
          ) : null}
          <div className={styles.manualActions}>
            <Button onClick={applyManual}>Áp dụng nhu cầu</Button>
            <Button variant="outline" onClick={() => setLookupRetryKey((value) => value + 1)}>
              Tải lại danh mục
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <div className={styles.needsSummary} aria-label="Tóm tắt nhu cầu đã chọn">
          <span className={styles.needsSummaryLabel}>Đang đối chiếu:</span>
          {summary.length > 0 ? (
            summary.map((item, index) => (
              <span key={`${item}-${index}`} className={styles.needsChip}>
                {item}
              </span>
            ))
          ) : (
            <span className={styles.needsHint}>Chưa có tiêu chí cụ thể.</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
