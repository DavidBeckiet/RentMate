import { Suspense } from "react";
import { LoadingState } from "../../../components/ui/feedback-states";
import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { PasswordResetConfirmationForm } from "../../../features/auth/password-reset-forms";

export default function ResetPasswordPage() {
  return (
    <AuthPageShell
      title="Đặt lại mật khẩu"
      description="Tạo mật khẩu mới cho tài khoản RentMate của bạn."
      footer={null}
    >
      <Suspense fallback={<LoadingState message="Đang mở liên kết đặt lại mật khẩu…" />}>
        <PasswordResetConfirmationForm />
      </Suspense>
    </AuthPageShell>
  );
}
