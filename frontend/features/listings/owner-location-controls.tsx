"use client";

import { useEffect, useRef, useState } from "react";
import { MapBase, type MapPoint } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { GeocodingCandidate } from "../../types/api";

const fallbackCenter: MapPoint = Object.freeze({ latitude: 10.776, longitude: 106.7 });
const maximumAddressCodePoints = 500;

interface OwnerLocationControlsProps {
  readonly addressText: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly disabled?: boolean;
  readonly onCoordinatesChange: (latitude: string, longitude: string) => void;
}

interface LocationFeedback {
  readonly kind: "error" | "empty" | "success";
  readonly message: string;
  readonly requestId?: string | null;
}

function draftPoint(latitude: string, longitude: string): MapPoint | null {
  const parsedLatitude = Number(latitude.trim());
  const parsedLongitude = Number(longitude.trim());
  if (
    !latitude.trim() ||
    !longitude.trim() ||
    !Number.isFinite(parsedLatitude) ||
    !Number.isFinite(parsedLongitude) ||
    parsedLatitude < -90 ||
    parsedLatitude > 90 ||
    parsedLongitude < -180 ||
    parsedLongitude > 180
  ) {
    return null;
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}

function geocodeError(error: unknown): LocationFeedback {
  if (!(error instanceof ApiError)) {
    return { kind: "error", message: "Không thể tìm vị trí lúc này. Hãy thử lại sau." };
  }
  if (error.status === 401) {
    return { kind: "error", message: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." };
  }
  if (error.status === 403) {
    return {
      kind: "error",
      message: "Bạn không có quyền sử dụng chức năng định vị này.",
      requestId: error.requestId
    };
  }
  if (error.status === 429) {
    return {
      kind: "error",
      message: "Dịch vụ định vị đang giới hạn yêu cầu. Hãy thử lại sau.",
      requestId: error.requestId
    };
  }
  if (error.status === 502) {
    return {
      kind: "error",
      message: "Dịch vụ định vị tạm thời không khả dụng.",
      requestId: error.requestId
    };
  }
  if (error.code === "NETWORK_ERROR") {
    return { kind: "error", message: "Không thể kết nối dịch vụ định vị. Bạn có thể thử lại khi sẵn sàng." };
  }
  if (error.status === 422) {
    return {
      kind: "error",
      message: "Địa chỉ chưa hợp lệ. Hãy kiểm tra lại trước khi tìm vị trí.",
      requestId: error.requestId
    };
  }
  return { kind: "error", message: "Không thể tìm vị trí lúc này. Hãy thử lại sau.", requestId: error.requestId };
}

export function OwnerLocationControls({
  addressText,
  latitude,
  longitude,
  disabled = false,
  onCoordinatesChange
}: OwnerLocationControlsProps) {
  const { refresh } = useAuth();
  const [candidates, setCandidates] = useState<readonly GeocodingCandidate[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<LocationFeedback | null>(null);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const point = draftPoint(latitude, longitude);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  const findLocation = async () => {
    if (pendingRef.current || disabled) return;
    const normalizedAddress = addressText.trim();
    if (!normalizedAddress) {
      setCandidates([]);
      setFeedback({ kind: "error", message: "Hãy nhập địa chỉ trước khi tìm vị trí." });
      return;
    }
    if ([...normalizedAddress].length > maximumAddressCodePoints) {
      setCandidates([]);
      setFeedback({ kind: "error", message: "Địa chỉ không được vượt quá 500 ký tự." });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setCandidates([]);
    setFeedback(null);

    try {
      const returned = await api.listings.forwardGeocode({ addressText: normalizedAddress }, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates(returned);
      setFeedback(
        returned.length === 0
          ? { kind: "empty", message: "Không tìm thấy vị trí phù hợp." }
          : { kind: "success", message: `Tìm thấy ${returned.length} vị trí. Hãy chọn một kết quả hoặc chỉnh ghim.` }
      );
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      setFeedback(geocodeError(caught));
      if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  const selectPoint = (selected: MapPoint) => {
    if (disabled) return;
    onCoordinatesChange(String(selected.latitude), String(selected.longitude));
  };

  return (
    <div className="space-y-5 border-t border-rent-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-rent-ink">Tìm và điều chỉnh vị trí</h3>
          <p className="mt-1 text-sm text-rent-secondary">
            Tìm theo địa chỉ chỉ chạy khi bạn bấm nút. Bạn vẫn có thể đặt hoặc kéo ghim thủ công.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          pending={pending}
          pendingLabel="Đang tìm…"
          disabled={disabled}
          onClick={() => void findLocation()}
        >
          Tìm vị trí từ địa chỉ
        </Button>
      </div>

      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-control border p-3 text-sm ${
            feedback.kind === "error"
              ? "border-red-200 bg-red-50 text-red-950"
              : feedback.kind === "empty"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-teal-200 bg-teal-50 text-teal-950"
          }`}
        >
          {feedback.message}
          {feedback.requestId ? ` Mã yêu cầu: ${feedback.requestId}` : ""}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-rent-ink">Kết quả địa chỉ</legend>
          <ul className="space-y-2">
            {candidates.map((candidate, index) => (
              <li key={`${candidate.latitude}:${candidate.longitude}:${index}`}>
                <button
                  type="button"
                  disabled={disabled || pending}
                  className="min-h-11 w-full rounded-control border border-rent-line bg-white px-4 py-3 text-left text-sm text-rent-ink transition-colors hover:border-teal-600 hover:bg-rent-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => selectPoint(candidate)}
                >
                  {candidate.displayName}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm text-rent-secondary">
          {point
            ? "Kéo ghim hoặc bấm một điểm khác trên bản đồ để chỉnh tọa độ chính xác."
            : "Bấm trên bản đồ để đặt ghim, hoặc nhập trực tiếp cặp tọa độ ở trên."}
        </p>
        <MapBase
          ariaLabel="Bản đồ điều chỉnh vị trí chính xác của tin"
          center={point ?? fallbackCenter}
          zoom={point ? 16 : 11}
          markers={
            point
              ? [
                  {
                    id: "owner-draft-location",
                    label: "Vị trí chính xác đang chỉnh sửa",
                    position: point,
                    draggable: !disabled
                  }
                ]
              : []
          }
          onMapClick={disabled ? undefined : selectPoint}
          onMarkerMove={disabled ? undefined : (_id, selected) => selectPoint(selected)}
        />
      </div>
    </div>
  );
}
