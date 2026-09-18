"use client";

import { useEffect, useRef, useState } from "react";
import { MapBase, type MapPoint } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { GeocodingCandidate } from "../../types/api";
import styles from "./owner-location-controls.module.css";

const fallbackCenter: MapPoint = Object.freeze({ latitude: 10.776, longitude: 106.7 });
const maximumAddressCodePoints = 500;

interface OwnerLocationControlsProps {
  readonly addressText: string;
  readonly areaName: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly confirmed: boolean;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly onCoordinatesChange: (latitude: string, longitude: string) => void;
  readonly onCurrentLocationResolved: (
    addressText: string,
    areaName: string,
    latitude: string,
    longitude: string
  ) => void;
  readonly onConfirmationChange: (confirmed: boolean) => void;
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
  if (error.code === "PROVIDER_UNAVAILABLE" || error.status === 502 || error.status === 503) {
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

function currentLocationError(code: number): string {
  if (code === 1) return "Bạn chưa cho phép truy cập vị trí. Hãy cấp quyền trong trình duyệt hoặc đặt ghim trên bản đồ.";
  if (code === 2) return "Thiết bị chưa xác định được vị trí. Hãy thử lại ở nơi có tín hiệu tốt hơn.";
  if (code === 3) return "Yêu cầu lấy vị trí đã hết thời gian. Hãy thử lại hoặc đặt ghim trên bản đồ.";
  return "Không thể lấy vị trí hiện tại. Hãy thử lại hoặc đặt ghim trên bản đồ.";
}

export function OwnerLocationControls({
  addressText,
  areaName,
  latitude,
  longitude,
  confirmed,
  error,
  disabled = false,
  onCoordinatesChange,
  onCurrentLocationResolved,
  onConfirmationChange
}: OwnerLocationControlsProps) {
  const { refresh } = useAuth();
  const [candidates, setCandidates] = useState<readonly GeocodingCandidate[]>([]);
  const [pending, setPending] = useState(false);
  const [currentLocationPending, setCurrentLocationPending] = useState(false);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<LocationFeedback | null>(null);
  const pendingRef = useRef(false);
  const currentLocationPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const addressRef = useRef(addressText);
  const resolvedAddressRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const point = draftPoint(latitude, longitude);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    addressRef.current = addressText;
    if (resolvedAddressRef.current === addressText) {
      resolvedAddressRef.current = null;
      return;
    }
    setCandidates([]);
    setFeedback(null);
    setAccuracyMeters(null);
  }, [addressText]);

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
    setAccuracyMeters(null);
    onConfirmationChange(false);
    onCoordinatesChange(String(selected.latitude), String(selected.longitude));
  };

  const resolveCurrentAddress = async (selected: MapPoint) => {
    const controller = new AbortController();
    const addressBeforeLookup = addressRef.current;
    controllerRef.current = controller;
    onConfirmationChange(false);
    onCoordinatesChange(String(selected.latitude), String(selected.longitude));

    try {
      const result = await api.listings.reverseGeocode(selected, controller.signal);
      if (controller.signal.aborted || !mountedRef.current) return;
      if (!result) {
        setFeedback({
          kind: "empty",
          message: "Đã đặt ghim nhưng chưa tìm được địa chỉ gần vị trí này. Bạn có thể nhập địa chỉ thủ công."
        });
        return;
      }

      if (addressRef.current !== addressBeforeLookup) {
        setFeedback({
          kind: "empty",
          message: "Đã đặt ghim. Địa chỉ bạn vừa chỉnh được giữ nguyên nên hệ thống không ghi đè bằng gợi ý GPS."
        });
        return;
      }

      resolvedAddressRef.current = result.addressText === addressText ? null : result.addressText;
      onCurrentLocationResolved(
        result.addressText,
        result.areaName,
        String(selected.latitude),
        String(selected.longitude)
      );
      setFeedback({
        kind: "success",
        message: "Đã tự điền địa chỉ và khu vực từ vị trí hiện tại. Hãy kiểm tra lại trước khi lưu."
      });
    } catch (caught: unknown) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const mapped = geocodeError(caught);
      setFeedback({
        ...mapped,
        message:
          caught instanceof ApiError && caught.status === 422
            ? "Vị trí hiện tại không hợp lệ. Hãy đặt ghim trên bản đồ."
            : mapped.message
      });
      if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller && mountedRef.current) {
        currentLocationPendingRef.current = false;
        setCurrentLocationPending(false);
      }
    }
  };

  const useCurrentLocation = () => {
    if (disabled || currentLocationPendingRef.current) return;
    setCandidates([]);
    setFeedback(null);

    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setFeedback({
        kind: "error",
        message: "Trình duyệt này không hỗ trợ lấy vị trí hiện tại. Hãy đặt ghim trực tiếp trên bản đồ."
      });
      return;
    }

    currentLocationPendingRef.current = true;
    setCurrentLocationPending(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return;
        const selected = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        };
        if (
          !Number.isFinite(selected.latitude) ||
          !Number.isFinite(selected.longitude) ||
          selected.latitude < -90 ||
          selected.latitude > 90 ||
          selected.longitude < -180 ||
          selected.longitude > 180
        ) {
          currentLocationPendingRef.current = false;
          setCurrentLocationPending(false);
          setFeedback({ kind: "error", message: "Thiết bị trả về vị trí không hợp lệ. Hãy đặt ghim trên bản đồ." });
          return;
        }
        setAccuracyMeters(
          Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
            ? Math.max(1, Math.round(position.coords.accuracy))
            : null
        );
        void resolveCurrentAddress(selected);
      },
      (locationError) => {
        if (!mountedRef.current) return;
        currentLocationPendingRef.current = false;
        setCurrentLocationPending(false);
        setFeedback({ kind: "error", message: currentLocationError(locationError.code) });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  };

  const hasAddress = addressText.trim().length > 0;
  const hasArea = areaName.trim().length > 0;
  const canConfirm = point !== null && hasAddress && hasArea;

  return (
    <div className={styles.locationAssistant}>
      <div className={styles.locationHeader}>
        <div className={styles.locationIntro}>
          <span className={styles.locationIcon}>
            <Icon name="pin" className="h-5 w-5" />
          </span>
          <div>
            <h3>Tìm và ghim vị trí</h3>
            <p>Bạn không cần biết hoặc nhập kinh độ, vĩ độ. RentMate sẽ lưu tọa độ từ kết quả bạn chọn.</p>
          </div>
        </div>
        <div className={styles.locationActions}>
          <Button
            type="button"
            aria-label="Dùng vị trí hiện tại"
            variant="secondary"
            pending={currentLocationPending}
            pendingLabel="Đang tìm địa chỉ…"
            disabled={disabled || pending}
            onClick={useCurrentLocation}
          >
            <Icon name="target" className="h-4 w-4" />
            Dùng vị trí hiện tại
          </Button>
          <Button
            type="button"
            aria-label="Tìm vị trí từ địa chỉ"
            variant="secondary"
            pending={pending}
            pendingLabel="Đang tìm…"
            disabled={disabled || currentLocationPending}
            onClick={() => void findLocation()}
          >
            <Icon name="search" className="h-4 w-4" />
            Tìm từ địa chỉ
          </Button>
        </div>
      </div>

      <div className={styles.locationSteps} aria-label="Tiến độ xác nhận địa chỉ">
        <div className={hasAddress && hasArea ? styles.stepComplete : styles.stepCurrent}>
          <span>{hasAddress && hasArea ? <Icon name="check" className="h-3.5 w-3.5" /> : "1"}</span>
          <div>
            <strong>Địa chỉ</strong>
            <small>{hasAddress && hasArea ? "Đã có thông tin" : "Điền địa chỉ và khu vực"}</small>
          </div>
        </div>
        <div className={point ? styles.stepComplete : styles.stepWaiting}>
          <span>{point ? <Icon name="check" className="h-3.5 w-3.5" /> : "2"}</span>
          <div>
            <strong>Ghim bản đồ</strong>
            <small>{point ? "Đã chọn vị trí" : "Chưa đặt ghim"}</small>
          </div>
        </div>
        <div className={confirmed ? styles.stepComplete : canConfirm ? styles.stepCurrent : styles.stepWaiting}>
          <span>{confirmed ? <Icon name="check" className="h-3.5 w-3.5" /> : "3"}</span>
          <div>
            <strong>Xác nhận</strong>
            <small>{confirmed ? "Đã hoàn tất" : "Kiểm tra lần cuối"}</small>
          </div>
        </div>
      </div>

      {accuracyMeters !== null ? (
        <div className={accuracyMeters <= 100 ? styles.accuracyGood : styles.accuracyWarning} role="status">
          <Icon name="target" className="h-4 w-4 shrink-0" />
          <span>
            GPS chính xác trong khoảng <strong>{accuracyMeters} m</strong>.
            {accuracyMeters > 100 ? " Hãy phóng to bản đồ và chỉnh lại ghim." : " Bạn vẫn nên kiểm tra đúng cổng hoặc tòa nhà."}
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className={styles.fieldError}>
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`${styles.feedback} ${
            feedback.kind === "error"
              ? styles.feedbackError
              : feedback.kind === "empty"
                ? styles.feedbackEmpty
                : styles.feedbackSuccess
          }`}
        >
          {feedback.message}
          {feedback.requestId ? ` Mã yêu cầu: ${feedback.requestId}` : ""}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <fieldset className={styles.results}>
          <legend>Kết quả phù hợp</legend>
          <ul>
            {candidates.map((candidate, index) => (
              <li key={`${candidate.latitude}:${candidate.longitude}:${index}`}>
                <button
                  type="button"
                  disabled={disabled || pending}
                  className={styles.resultButton}
                  onClick={() => selectPoint(candidate)}
                >
                  {candidate.displayName}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <div className={styles.mapPanel}>
        <div className={styles.mapCaption}>
          <div>
            <strong>Kiểm tra điểm ghim</strong>
            <p>Kéo ghim tới đúng cổng hoặc tòa nhà. Người thuê chỉ thấy vị trí gần đúng.</p>
          </div>
          {confirmed ? (
            <span className={styles.confirmedBadge}>
              <Icon name="check" className="h-4 w-4" />
              Đã xác nhận
            </span>
          ) : null}
        </div>
        <MapBase
          ariaLabel="Bản đồ điều chỉnh vị trí chính xác của tin"
          center={point ?? fallbackCenter}
          zoom={point ? 16 : 11}
          className="h-64 w-full sm:h-72"
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

      <div className={confirmed ? styles.confirmationComplete : styles.confirmationPending}>
        <span className={styles.confirmationIcon}>
          <Icon name={confirmed ? "check" : "pin"} className="h-5 w-5" />
        </span>
        <div>
          <strong>{confirmed ? "Địa chỉ và vị trí đã khớp" : "Xác nhận trước khi lưu"}</strong>
          <p>
            {confirmed
              ? "Nếu chỉnh địa chỉ hoặc di chuyển ghim, bạn sẽ cần xác nhận lại."
              : canConfirm
                ? "Đối chiếu địa chỉ với điểm ghim trên bản đồ, sau đó xác nhận."
                : "Hãy điền đủ địa chỉ, khu vực và đặt một điểm ghim trên bản đồ."}
          </p>
        </div>
        {!confirmed ? (
          <Button
            type="button"
            disabled={disabled || !canConfirm}
            onClick={() => {
              onConfirmationChange(true);
              setFeedback({ kind: "success", message: "Đã xác nhận địa chỉ và vị trí. Bạn có thể lưu thay đổi." });
            }}
          >
            <Icon name="check" className="h-4 w-4" />
            Xác nhận địa chỉ & vị trí
          </Button>
        ) : null}
      </div>
    </div>
  );
}
