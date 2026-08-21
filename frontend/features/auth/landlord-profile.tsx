"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import styles from "./landlord-profile.module.css";

const e164Phone = /^\+[1-9][0-9]{7,14}$/;

interface ProfileFeedback {
  readonly phone?: string;
  readonly message?: string;
  readonly requestId?: string | null;
  readonly success?: string;
}

function profileError(error: unknown): ProfileFeedback {
  if (!(error instanceof ApiError)) return { message: "Không thể cập nhật hồ sơ lúc này. Vui lòng thử lại sau." };
  if (error.status === 401) return { message: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." };
  if (error.status === 403) return { message: "Bạn không có quyền cập nhật hồ sơ này.", requestId: error.requestId };
  if (error.code === "NETWORK_ERROR") {
    return {
      message: "Không thể xác nhận việc cập nhật hồ sơ. Bạn có thể kiểm tra lại rồi thử lại."
    };
  }
  if (error.status !== null && error.status >= 500) {
    return { message: "Không thể cập nhật hồ sơ lúc này. Vui lòng thử lại sau.", requestId: error.requestId };
  }
  const mapped = mapApiErrorToFields(error, ["phone"] as const);
  return { phone: mapped.fieldErrors.phone, message: mapped.formMessage ?? undefined, requestId: mapped.requestId };
}

export function LandlordProfile() {
  const { status, user, error: authError, refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ProfileFeedback>({});
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "LANDLORD") setPhone(user.phone ?? "");
  }, [status, user]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  if (status === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (status === "anonymous") {
    return (
      <EmptyState
        title="Đăng nhập để quản lý hồ sơ"
        description="Trang này dành cho tài khoản người cho thuê."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này. Vui lòng thử lại."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!user || user.role !== "LANDLORD") {
    return (
      <EmptyState
        title="Trang này dành cho tài khoản người cho thuê"
        description="Hãy dùng tài khoản người cho thuê để cập nhật hồ sơ."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/">
            Tìm phòng
          </Link>
        }
      />
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const normalizedPhone = phone.trim();
    if (!e164Phone.test(normalizedPhone)) {
      setFeedback({ phone: "Số điện thoại phải theo định dạng E.164, ví dụ +84901234567." });
      return;
    }

    const canonical = { phone: user.phone, updatedAt: user.updatedAt };
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setFeedback({});

    try {
      const returned = await api.users.updateCurrent({ phone: normalizedPhone }, controller.signal);
      if (controller.signal.aborted) return;
      const noOp = returned.phone === canonical.phone && returned.updatedAt === canonical.updatedAt;
      setPhone(returned.phone ?? "");
      setFeedback({ success: noOp ? "Không có thay đổi cần lưu." : "Đã cập nhật hồ sơ." });
      await refresh();
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const result = profileError(caught);
      setFeedback(result);
      if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  return (
    <section aria-labelledby="landlord-profile-heading" className={`${styles.profile} rm-workspace grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start`}>
      <header className="border-b border-rent-line pb-6">
        <p className="text-sm font-semibold text-teal-700">TÀI KHOẢN NGƯỜI CHO THUÊ</p>
        <h1 id="landlord-profile-heading" className="mt-2 text-3xl font-bold text-rent-ink sm:text-4xl">
          Hồ sơ liên hệ
        </h1>
        <p className="mt-3 leading-7 text-rent-secondary">
          Email đăng nhập không thể thay đổi. Số điện thoại là thông tin liên hệ bắt buộc của người cho thuê.
        </p>
      </header>

      <form
        onSubmit={(event) => void submit(event)}
        className="rm-workspace-panel space-y-6 p-5 sm:p-7"
      >
        <InputField id="landlord-email" name="email" label="Email" type="email" value={user.email} readOnly />
        <InputField
          id="landlord-phone"
          name="phone"
          label="Số điện thoại"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          error={feedback.phone}
          hint={
            user.phone === null
              ? "Hồ sơ đang thiếu số điện thoại bắt buộc."
              : "Dùng định dạng E.164, ví dụ +84901234567."
          }
          onChange={(event) => {
            setPhone(event.target.value);
            setFeedback({});
          }}
        />

        {feedback.message ? (
          <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            {feedback.message}
            {feedback.requestId ? ` Mã yêu cầu: ${feedback.requestId}` : ""}
          </p>
        ) : null}
        {feedback.success ? (
          <p aria-live="polite" className="rounded-control bg-rent-primary-subtle p-3 text-sm font-medium text-teal-900">
            {feedback.success}
          </p>
        ) : null}

        <Button type="submit" pending={pending} pendingLabel="Đang lưu…">
          Lưu hồ sơ
        </Button>
      </form>
    </section>
  );
}
