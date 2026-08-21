"use client";

import { useEffect, useState } from "react";
import type { MapPoint } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { InputField } from "../../components/ui/form-controls";

export interface RadiusControlsProps {
  readonly proposedCenter: MapPoint | null;
  readonly selectingCenter: boolean;
  readonly initialRadiusKm?: number;
  readonly resetKey: number;
  readonly onProposedCenterChange: (point: MapPoint) => void;
  readonly onSelectingCenterChange: (selecting: boolean) => void;
  readonly onCommit: (center: MapPoint, radiusKm: number) => void;
}

function geolocationMessage(code: number): string {
  if (code === 1) return "Bạn chưa cho phép truy cập vị trí. Hãy chọn tâm trực tiếp trên bản đồ.";
  if (code === 2) return "Trình duyệt chưa xác định được vị trí. Hãy thử lại hoặc chọn tâm trên bản đồ.";
  if (code === 3) return "Yêu cầu vị trí đã hết thời gian. Hãy thử lại hoặc chọn tâm trên bản đồ.";
  return "Không thể lấy vị trí hiện tại. Hãy chọn tâm trực tiếp trên bản đồ.";
}

export function RadiusControls({
  proposedCenter,
  selectingCenter,
  initialRadiusKm,
  resetKey,
  onProposedCenterChange,
  onSelectingCenterChange,
  onCommit
}: RadiusControlsProps) {
  const [radius, setRadius] = useState(initialRadiusKm === undefined ? "" : String(initialRadiusKm));
  const [radiusError, setRadiusError] = useState<string>();
  const [locationPending, setLocationPending] = useState(false);
  const [locationError, setLocationError] = useState<string>();

  useEffect(() => {
    setRadius(initialRadiusKm === undefined ? "" : String(initialRadiusKm));
    setRadiusError(undefined);
    setLocationError(undefined);
    setLocationPending(false);
  }, [initialRadiusKm, resetKey]);

  const requestCurrentLocation = () => {
    setLocationError(undefined);
    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setLocationError("Trình duyệt này không hỗ trợ vị trí hiện tại. Hãy chọn tâm trên bản đồ.");
      return;
    }

    setLocationPending(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationPending(false);
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (
          !Number.isFinite(point.latitude) ||
          !Number.isFinite(point.longitude) ||
          point.latitude < -90 ||
          point.latitude > 90 ||
          point.longitude < -180 ||
          point.longitude > 180
        ) {
          setLocationError("Trình duyệt trả về vị trí không hợp lệ. Hãy chọn tâm trên bản đồ.");
          return;
        }
        onSelectingCenterChange(false);
        onProposedCenterChange(point);
      },
      (error) => {
        setLocationPending(false);
        setLocationError(geolocationMessage(error.code));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 }
    );
  };

  const commitRadius = () => {
    const value = Number(radius);
    if (radius.trim().length === 0 || !Number.isFinite(value) || value <= 0) {
      setRadiusError("Bán kính phải là một số lớn hơn 0.");
      return;
    }
    if (!proposedCenter) {
      setRadiusError("Hãy chọn tâm trên bản đồ hoặc dùng vị trí hiện tại.");
      return;
    }
    setRadiusError(undefined);
    onCommit(proposedCenter, value);
  };

  return (
    <section aria-labelledby="radius-heading" className="rounded-card border border-rent-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="radius-heading" className="font-semibold text-rent-ink">
            Tìm theo bán kính
          </h2>
          <p className="mt-1 text-sm text-rent-secondary">
            Chọn tâm thủ công hoặc dùng vị trí hiện tại, sau đó chủ động bắt đầu tìm kiếm.
          </p>
        </div>
        {proposedCenter ? (
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            Đã chọn tâm tìm kiếm
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(10rem,0.6fr)_1fr] md:items-end">
        <InputField
          id="radius-km"
          name="radiusKm"
          label="Bán kính (km)"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={radius}
          error={radiusError}
          onChange={(event) => {
            setRadius(event.target.value);
            setRadiusError(undefined);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            aria-pressed={selectingCenter}
            onClick={() => {
              setLocationError(undefined);
              onSelectingCenterChange(true);
            }}
          >
            {selectingCenter ? "Đang chờ chọn tâm…" : "Chọn tâm trên bản đồ"}
          </Button>
          <Button
            variant="secondary"
            pending={locationPending}
            pendingLabel="Đang lấy vị trí…"
            onClick={requestCurrentLocation}
          >
            Dùng vị trí hiện tại
          </Button>
          <Button onClick={commitRadius}>Tìm theo bán kính</Button>
        </div>
      </div>
      {locationError ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {locationError}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-rent-subtle">
        Vị trí chỉ được gửi trong truy vấn tìm kiếm sau khi bạn xác nhận; RentMate không lưu hoặc theo dõi vị trí nền.
      </p>
    </section>
  );
}
