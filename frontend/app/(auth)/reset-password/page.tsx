import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { PasswordResetConfirmationForm } from "../../../features/auth/password-reset-forms";

export default function ResetPasswordPage() {
  return (
    <AuthPageShell
      variant="recovery"
      title="Đặt lại mật khẩu"
      description="Nhập mã 6 số trong email và tạo mật khẩu mới."
      footer={null}
    >
      <PasswordResetConfirmationForm />
    </AuthPageShell>
  );
}
