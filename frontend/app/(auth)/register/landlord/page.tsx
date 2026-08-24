import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { RegistrationForm } from "../../../../features/auth/registration-form";

export default function LandlordRegistrationPage() {
  return (
    <AuthPageShell
      variant="landlord"
      title="Đăng ký cho thuê"
      description="Tạo tài khoản để đăng và quản lý phòng cho thuê."
      footer={
        <div className="space-y-2">
          <p>
            Bạn đang tìm phòng? <Link href="/register/tenant">Đăng ký tài khoản người thuê</Link>
          </p>
          <p>
            Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
          </p>
        </div>
      }
    >
      <RegistrationForm mode="landlord" />
    </AuthPageShell>
  );
}
