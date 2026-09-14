"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import styles from "./roommate-profile.module.css";
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
import { RoommateAvatar, RoommatePageHeader, RoommateTenantBoundary } from "./roommate-shared";
import { RoommateVerificationPanel } from "./roommate-verification-panel";
import { RoommateAiPreferencePanel } from "./roommate-ai-preference-panel";

const emptyProfile: RoommateProfileBody = {
  intro: "",
  sleepSchedule: "STANDARD",
  cleanlinessLevel: "BALANCED",
  noisePreference: "BALANCED",
  smokingEnvironment: "NO_PREFERENCE",
  petEnvironment: "OK_WITH_PETS"
};

function LifestyleChoices({
  name,
  label,
  value,
  options,
  onChange
}: Readonly<{
  name: string;
  label: string;
  value: string;
  options: Readonly<Record<string, string>>;
  onChange: (value: string) => void;
}>) {
  return (
    <fieldset className={styles.choices}>
      <legend>{label}</legend>
      <div className={styles.choiceGrid}>
        {Object.entries(options).map(([key, text]) => (
          <label key={key} className={styles.choice}>
            <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

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

  if (loadState === "loading")
    return <LoadingState message="Đang tải hồ sơ ở ghép…" className="rm-roommate-card-static" />;
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
    <div className={`rm-roommate-page ${styles.page}`}>
      <RoommatePageHeader title="Hồ sơ ở ghép" description="Một chút về bạn, để tìm người cùng nhà hợp nhịp sống." />
      <div className={styles.layout}>
        <Card className={`rm-roommate-card-static ${styles.editor}`}>
          <form
            className={styles.form}
            onSubmit={(event) => void save(event)}
            onChange={() => setSaved(false)}
            noValidate
          >
            <p className={styles.status} data-tone={profileCompleted ? "accent" : undefined} role="status">
              {profileCompleted
                ? "Hồ sơ ở ghép đã hoàn thành."
                : "Hồ sơ chưa sẵn sàng để dùng cho các tương tác ở ghép. Hãy hoàn thành các trường bắt buộc hoặc kiểm tra lại sau."}
            </p>
            <section className={styles.section} aria-labelledby="roommate-profile-about-heading">
              <div>
                <p className={styles.step}>01 · Về bạn</p>
                <h2
                  id="roommate-profile-about-heading"
                  className="mt-1 font-display text-heading-sm font-bold text-foreground"
                >
                  Bạn là người cùng nhà như thế nào?
                </h2>
                <p className="mt-1 text-ui-sm text-muted-foreground">
                  Chia sẻ thói quen, sở thích và điều bạn coi trọng khi sống chung.
                </p>
              </div>
              <TextareaField
                id="roommate-intro"
                name="intro"
                label="Giới thiệu ngắn"
                hint="Từ 20 đến 500 ký tự. Không đưa thông tin liên hệ hoặc địa chỉ riêng vào đây."
                required
                minLength={20}
                maxLength={500}
                error={introError ?? undefined}
                rows={4}
                placeholder="Ví dụ: Mình đi làm giờ hành chính, thích nấu ăn và giữ không gian chung gọn gàng…"
                value={profile.intro}
                onChange={(event) => {
                  setProfile((current) => ({ ...current, intro: event.target.value }));
                  if (introError) setIntroError(null);
                }}
              />
              <p aria-live="polite" className="text-right text-ui-xs font-semibold text-muted-foreground">
                {Array.from(profile.intro).length}/500 ký tự
              </p>
            </section>
            <RoommateAiPreferencePanel
              target="PROFILE"
              onApply={(values) => {
                setSaved(false);
                setProfile((current) => ({ ...current, ...(values as Partial<RoommateProfileBody>) }));
              }}
            />
            <section className={styles.section} aria-labelledby="roommate-profile-rhythm-heading">
              <div>
                <p className={styles.step}>02 · Nhịp sống</p>
                <h2
                  id="roommate-profile-rhythm-heading"
                  className="mt-1 font-display text-heading-sm font-bold text-foreground"
                >
                  Thói quen mỗi ngày
                </h2>
                <p className="mt-1 text-ui-sm text-muted-foreground">
                  Chọn mô tả gần với bạn nhất để dễ trao đổi trước khi sống chung.
                </p>
              </div>
              <div className={styles.preferenceGroups}>
                <LifestyleChoices
                  name="sleepSchedule"
                  label="Nhịp sinh hoạt"
                  value={profile.sleepSchedule}
                  options={roommateSleepScheduleLabels}
                  onChange={(value) => {
                    setSaved(false);
                    setProfile((current) => ({
                      ...current,
                      sleepSchedule: value as RoommateProfileBody["sleepSchedule"]
                    }));
                  }}
                />
                <LifestyleChoices
                  name="cleanlinessLevel"
                  label="Mức độ gọn gàng"
                  value={profile.cleanlinessLevel}
                  options={roommateCleanlinessLabels}
                  onChange={(value) => {
                    setSaved(false);
                    setProfile((current) => ({
                      ...current,
                      cleanlinessLevel: value as RoommateProfileBody["cleanlinessLevel"]
                    }));
                  }}
                />
              </div>
            </section>
            <section className={styles.section} aria-labelledby="roommate-profile-environment-heading">
              <div>
                <p className={styles.step}>03 · Không gian chung</p>
                <h2
                  id="roommate-profile-environment-heading"
                  className="mt-1 font-display text-heading-sm font-bold text-foreground"
                >
                  Bạn muốn sống trong môi trường nào?
                </h2>
                <p className="mt-1 text-ui-sm text-muted-foreground">
                  Nói rõ mong muốn về tiếng ồn, thuốc lá và thú cưng.
                </p>
              </div>
              <div className={styles.preferenceGroups}>
                <LifestyleChoices
                  name="noisePreference"
                  label="Ưu tiên không gian"
                  value={profile.noisePreference}
                  options={roommateNoiseLabels}
                  onChange={(value) => {
                    setSaved(false);
                    setProfile((current) => ({
                      ...current,
                      noisePreference: value as RoommateProfileBody["noisePreference"]
                    }));
                  }}
                />
                <LifestyleChoices
                  name="smokingEnvironment"
                  label="Môi trường thuốc lá"
                  value={profile.smokingEnvironment}
                  options={roommateSmokingLabels}
                  onChange={(value) => {
                    setSaved(false);
                    setProfile((current) => ({
                      ...current,
                      smokingEnvironment: value as RoommateProfileBody["smokingEnvironment"]
                    }));
                  }}
                />
                <LifestyleChoices
                  name="petEnvironment"
                  label="Thú cưng"
                  value={profile.petEnvironment}
                  options={roommatePetLabels}
                  onChange={(value) => {
                    setSaved(false);
                    setProfile((current) => ({
                      ...current,
                      petEnvironment: value as RoommateProfileBody["petEnvironment"]
                    }));
                  }}
                />
              </div>
            </section>
            {submitError ? (
              <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
                {submitError}
              </p>
            ) : null}
            {saved ? (
              <p
                role="status"
                className="rm-roommate-callout text-ui-sm font-bold text-success-foreground"
                data-tone="accent"
              >
                Hồ sơ ở ghép đã được lưu.
              </p>
            ) : null}
            <div className={styles.saveBar}>
              <p className="text-ui-xs text-muted-foreground">
                {saved ? "Các thay đổi của bạn đã được lưu." : "Bấm lưu để cập nhật nội dung đã chỉnh."}
              </p>
              <Button className="w-full sm:w-auto" type="submit" pending={pending} pendingLabel="Đang lưu hồ sơ…">
                Lưu hồ sơ ở ghép
              </Button>
            </div>
          </form>
        </Card>
        <aside className={styles.sidebar} aria-label="Xem trước hồ sơ ở ghép">
          <div className={styles.preview}>
            <p className={styles.step}>Hồ sơ của bạn</p>
            <div className={styles.identity}>
              <RoommateAvatar displayName={user?.displayName ?? null} />
              <div>
                <h2>{user?.displayName ?? "Người thuê RentMate"}</h2>
                <p>{saved ? "Đã lưu hồ sơ" : "Bản xem trước nội dung đang chỉnh"}</p>
              </div>
            </div>
            <p className={styles.intro}>{profile.intro.trim() || "Lời giới thiệu của bạn sẽ xuất hiện tại đây."}</p>
            <dl className={styles.facts}>
              {[
                ["Nhịp sinh hoạt", roommateSleepScheduleLabels[profile.sleepSchedule]],
                ["Gọn gàng", roommateCleanlinessLabels[profile.cleanlinessLevel]],
                ["Không gian", roommateNoiseLabels[profile.noisePreference]],
                ["Thuốc lá", roommateSmokingLabels[profile.smokingEnvironment]],
                ["Thú cưng", roommatePetLabels[profile.petEnvironment]]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <RoommateVerificationPanel
            presentation="compact"
            className={styles.verification}
            onEditProfile={() => router.push("/profile")}
          />
          <div className={styles.tip}>
            <Icon name="shield" className="h-5 w-5" />
            <div>
              <h3>Chia sẻ vừa đủ, kết nối an tâm</h3>
              <p>
                Giữ riêng số điện thoại, địa chỉ chính xác, OTP và thông tin tài chính. Bạn có thể trao đổi thêm khi đã
                kết nối.
              </p>
            </div>
          </div>
        </aside>
      </div>
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
