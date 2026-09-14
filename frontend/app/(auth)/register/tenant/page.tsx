import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { RegistrationForm } from "../../../../features/auth/registration-form";

export default function TenantRegistrationPage() {
  return (
    <AuthPageShell
      variant="tenant"
      title="Đăng ký tìm phòng"
      description="Tạo tài khoản để tìm, lưu và liên hệ với chủ trọ."
      contextAction={
        <Link href="/register" aria-label="Chọn lại loại tài khoản">
          ← Chọn lại loại tài khoản
        </Link>
      }
      footer={null}
    >
      <RegistrationForm mode="tenant" />
    </AuthPageShell>
  );
}
