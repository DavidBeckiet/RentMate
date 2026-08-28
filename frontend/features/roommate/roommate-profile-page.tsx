"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { SelectField, TextareaField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { RoommateProfileBody } from "../../types/api";
import {
  roommateCleanlinessLabels,
  roommateErrorMessage,
  roommateNoiseLabels,
  roommatePetLabels,
  roommateSleepScheduleLabels,
  roommateSmokingLabels
} from "./roommate-content";
import { RoommatePageHeader, RoommateSubnav, RoommateTenantBoundary } from "./roommate-shared";
import { RoommateVerificationPanel } from "./roommate-verification-panel";

const emptyProfile: RoommateProfileBody = {
  intro: "",
  sleepSchedule: "STANDARD",
  cleanlinessLevel: "BALANCED",
  noisePreference: "BALANCED",
  smokingEnvironment: "NO_PREFERENCE",
  petEnvironment: "OK_WITH_PETS"
};

function safeReturnPath(value: string | null): string | null {
  return value?.startsWith("/roommates/") ? value : null;
}

function profileIntroLength(value: string): number {
  return Array.from(value.trim()).length;
}

function ProfileEditor() {
  const { status: authStatus, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<RoommateProfileBody>(emptyProfile);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [introError, setIntroError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);

  useEffect(() => {
    if (authStatus !== "authenticated" || user?.role !== "TENANT" || !user.isActive) return;
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError(null);
    void api.roommates
      .getProfile(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setProfile({
          intro: result.intro,
          sleepSchedule: result.sleepSchedule,
          cleanlinessLevel: result.cleanlinessLevel,
          noisePreference: result.noisePreference,
          smokingEnvironment: result.smokingEnvironment,
          petEnvironment: result.petEnvironment
        });
        setProfileCompleted(result.profileCompleted);
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = caught instanceof ApiError ? caught : null;
        if (error?.status === 404) {
          setProfile(emptyProfile);
          setProfileCompleted(false);
          setLoadState("ready");
          return;
        }
        setLoadError(error);
        setLoadState("error");
      });
    return () => controller.abort();
  }, [authStatus, user?.isActive, user?.role]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setIntroError(null);
    setSaved(false);
    if (profileIntroLength(profile.intro) < 20) {
      setIntroError("Phần giới thiệu cần có ít nhất 20 ký tự.");
      return;
    }
    setPending(true);
    try {
      const savedProfile = await api.roommates.upsertProfile(profile);
      setProfile({
        intro: savedProfile.intro,
        sleepSchedule: savedProfile.sleepSchedule,
        cleanlinessLevel: savedProfile.cleanlinessLevel,
        noisePreference: savedProfile.noisePreference,
        smokingEnvironment: savedProfile.smokingEnvironment,
        petEnvironment: savedProfile.petEnvironment
      });
      setProfileCompleted(savedProfile.profileCompleted);
      setSaved(true);
      const next = safeReturnPath(searchParams.get("next"));
      if (next) router.push(next);
    } catch (caught) {
      setSubmitError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (loadState === "loading") return <LoadingState message="Đang tải hồ sơ ở ghép…" />;
  if (loadState === "error") {
    return (
      <ErrorState
        message={roommateErrorMessage(loadError)}
        requestId={loadError?.requestId}
        action={<Button onClick={() => window.location.reload()}>Thử lại</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <RoommatePageHeader
        title="Hồ sơ ở ghép"
        description="Chia sẻ các ưu tiên sinh hoạt cơ bản để người khác hiểu bối cảnh. Không đưa thông tin liên hệ, OTP, thông tin tài chính hoặc địa chỉ chính xác vào hồ sơ."
      />
      <RoommateSubnav />
      <Card className="mx-auto max-w-3xl">
        <form className="space-y-5" onSubmit={(event) => void save(event)} noValidate>
          <p
            className="border-l-4 border-heroDark-950 bg-rent-canvas pl-3 py-2 text-ui-sm leading-6 text-rent-secondary"
            role="status"
          >
            {profileCompleted
              ? "Hồ sơ ở ghép đã hoàn thành."
              : "Hồ sơ chưa sẵn sàng để dùng cho các tương tác ở ghép. Hãy hoàn thành các trường bắt buộc hoặc kiểm tra lại sau."}
          </p>
          <TextareaField
            id="roommate-intro"
            name="intro"
            label="Giới thiệu ngắn"
            hint="Từ 20 đến 500 ký tự. Chỉ chia sẻ thông tin sinh hoạt phù hợp với mục đích ở ghép."
            required
            minLength={20}
            maxLength={500}
            error={introError ?? undefined}
            rows={6}
            value={profile.intro}
            onChange={(event) => {
              setProfile((current) => ({ ...current, intro: event.target.value }));
              if (introError) setIntroError(null);
            }}
          />
          <p aria-live="polite" className="text-right text-ui-xs font-semibold text-rent-secondary">
            {Array.from(profile.intro).length}/500 ký tự
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="roommate-sleep-schedule"
              name="sleepSchedule"
              label="Nhịp sinh hoạt"
              hint="Mô tả khung giờ sinh hoạt thường thấy; không dùng để chấm điểm mức độ phù hợp."
              value={profile.sleepSchedule}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  sleepSchedule: event.target.value as RoommateProfileBody["sleepSchedule"]
                }))
              }
            >
              {Object.entries(roommateSleepScheduleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="roommate-cleanliness"
              name="cleanlinessLevel"
              label="Mức độ gọn gàng"
              hint="Mô tả mong muốn khi dùng không gian chung, không phải tiêu chí đánh giá con người."
              value={profile.cleanlinessLevel}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  cleanlinessLevel: event.target.value as RoommateProfileBody["cleanlinessLevel"]
                }))
              }
            >
              {Object.entries(roommateCleanlinessLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="roommate-noise"
              name="noisePreference"
              label="Ưu tiên không gian"
              hint="Mô tả cách bạn muốn sử dụng không gian chung để có thêm ngữ cảnh trao đổi."
              value={profile.noisePreference}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  noisePreference: event.target.value as RoommateProfileBody["noisePreference"]
                }))
              }
            >
              {Object.entries(roommateNoiseLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="roommate-smoking"
              name="smokingEnvironment"
              label="Môi trường thuốc lá"
              hint="Mô tả môi trường sinh hoạt bạn mong muốn để trao đổi trước."
              value={profile.smokingEnvironment}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  smokingEnvironment: event.target.value as RoommateProfileBody["smokingEnvironment"]
                }))
              }
            >
              {Object.entries(roommateSmokingLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="roommate-pets"
              name="petEnvironment"
              label="Thú cưng"
              hint="Mô tả bối cảnh thú cưng để hai bên trao đổi trước khi gặp."
              value={profile.petEnvironment}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  petEnvironment: event.target.value as RoommateProfileBody["petEnvironment"]
                }))
              }
            >
              {Object.entries(roommatePetLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          {submitError ? (
            <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
              {submitError}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="border-l-4 border-heroDark-950 pl-3 text-ui-sm font-bold">
              Hồ sơ ở ghép đã được lưu.
            </p>
          ) : null}
          <Button className="w-full sm:w-auto" type="submit" pending={pending} pendingLabel="Đang lưu hồ sơ…">
            Lưu hồ sơ ở ghép
          </Button>
        </form>
      </Card>
      <RoommateVerificationPanel />
    </div>
  );
}

export function RoommateProfilePage() {
  return (
    <RoommateTenantBoundary>
      <ProfileEditor />
    </RoommateTenantBoundary>
  );
}
