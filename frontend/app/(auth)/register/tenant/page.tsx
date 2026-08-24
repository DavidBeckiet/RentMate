import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { RegistrationForm } from "../../../../features/auth/registration-form";

export default function TenantRegistrationPage() {
  return (
    <AuthPageShell
      variant="tenant"
      title="Đăng ký tìm phòng"
      description="Tạo tài khoản để tìm, lưu và liên hệ với chủ trọ."
      footer={
        <div className="space-y-2">
          <p>
            Bạn muốn cho thuê? <Link href="/register/landlord">Đăng ký tài khoản chủ trọ</Link>
          </p>
          <p>
            Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
          </p>
        </div>
      }
    >
      <RegistrationForm mode="tenant" />
    </AuthPageShell>
  );
}
