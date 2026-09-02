"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import { normalizeVietnamesePhone } from "./validation";

const phonePattern = /^\+[1-9][0-9]{7,14}$/;
const secondaryLinkClasses =
  "font-semibold text-primary-hover underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2";

type CompletionAction = "restart" | "login" | null;

interface CompletionFeedback {
  readonly phone: string | null;
  readonly formMessage: string | null;
  readonly requestId: string | null;
  readonly action: CompletionAction;
}

const emptyFeedback: CompletionFeedback = { phone: null, formMessage: null, requestId: null, action: null };

function feedbackFor(error: unknown): CompletionFeedback {
  if (error instanceof ApiError) {
    if (error.code === "GOOGLE_ONBOARDING_REQUIRED") {
      return {
        phone: null,
        formMessage: "Phiên đăng ký Google đã hết hạn hoặc đã được sử dụng. Hãy bắt đầu lại.",
        requestId: error.requestId,
        action: "restart"
      };
    }
    if (error.code === "GOOGLE_ACCOUNT_EXISTS") {
      return {
        phone: null,
        formMessage: "Tài khoản Google này đã được đăng ký trên RentMate. Hãy đăng nhập thay vì đăng ký lại.",
        requestId: error.requestId,
        action: "login"
      };
    }
    if (error.code === "VALIDATION_FAILED") {
      const mapped = mapApiErrorToFields(error, ["phone"] as const);
      return {
        phone: mapped.fieldErrors.phone ?? null,
        formMessage: mapped.fieldErrors.phone ? null : "Số điện thoại chưa hợp lệ. Vui lòng kiểm tra lại.",
        requestId: mapped.requestId,
        action: null
      };
    }
    if (error.code === "RATE_LIMITED") {
      return {
        phone: null,
        formMessage: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
        requestId: error.requestId,
        action: null
      };
    }
    if (error.code === "NETWORK_ERROR") {
      return {
        phone: null,
        formMessage: "Không thể kết nối đến máy chủ. Vui lòng thử lại.",
        requestId: null,
        action: null
      };
    }
    return {
      phone: null,
      formMessage: "Không thể hoàn tất đăng ký lúc này. Vui lòng thử lại sau.",
      requestId: error.requestId,
      action: null
    };
  }

  return {
    phone: null,
    formMessage: "Không thể hoàn tất đăng ký lúc này. Vui lòng thử lại sau.",
    requestId: null,
    action: null
  };
}

export function GoogleLandlordCompletionForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<CompletionFeedback>(emptyFeedback);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const normalizedPhone = normalizeVietnamesePhone(phone);
    if (!normalizedPhone) {
      setFeedback({ ...emptyFeedback, phone: "Vui lòng nhập số điện thoại." });
      document.getElementById("google-landlord-completion-phone")?.focus();
      return;
    }
    if (!phonePattern.test(normalizedPhone)) {
      setFeedback({ ...emptyFeedback, phone: "Số điện thoại chưa đúng. Vui lòng kiểm tra lại." });
      document.getElementById("google-landlord-completion-phone")?.focus();
      return;
    }

    setPending(true);
    setFeedback(emptyFeedback);
    try {
      await api.auth.completeGoogleLandlord({ phone: normalizedPhone });
      await refresh();
      router.replace("/");
    } catch (error) {
      setFeedback(feedbackFor(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <div className="rounded-control border border-info/25 bg-info-subtle p-4 text-ui-sm text-info-foreground shadow-surface">
        <p className="font-semibold">Google đã xác minh tài khoản của bạn.</p>
        <p className="mt-1 text-muted-foreground">
          Số điện thoại giúp người thuê liên hệ với bạn về phòng đăng trên RentMate.
        </p>
      </div>
      <InputField
        id="google-landlord-completion-phone"
        name="phone"
        label="Số điện thoại"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        requiredIndicator="sr-only"
        leadingIcon={<Icon name="phone" className="h-4 w-4" />}
        className="rm-auth-control"
        placeholder="0912345678"
        hint="Bạn có thể nhập số di động Việt Nam hoặc số dạng quốc tế."
        value={phone}
        error={feedback.phone ?? undefined}
        onChange={(event) => {
          setPhone(event.currentTarget.value);
          setFeedback(emptyFeedback);
        }}
      />
      {feedback.formMessage ? (
        <ErrorState
          message={feedback.formMessage}
          requestId={feedback.requestId}
          action={
            feedback.action === "restart" ? (
              <Link href="/register/landlord" className={secondaryLinkClasses}>
                Bắt đầu lại bằng Google
              </Link>
            ) : feedback.action === "login" ? (
              <Link href="/login" className={secondaryLinkClasses}>
                Đến trang đăng nhập
              </Link>
            ) : undefined
          }
        />
      ) : null}
      <Button type="submit" pending={pending} pendingLabel="Đang hoàn tất…" className="rm-auth-primary w-full">
        <Icon name="check" className="h-4 w-4" />
        Hoàn tất đăng ký
      </Button>
    </form>
  );
}
