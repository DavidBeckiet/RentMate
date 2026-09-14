import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { RegistrationForm } from "../../../../features/auth/registration-form";

export default function LandlordRegistrationPage() {
  return (
    <AuthPageShell
      variant="landlord"
      title="Đăng ký cho thuê"
      description="Tạo tài khoản để đăng và quản lý phòng cho thuê."
      contextAction={
        <Link href="/register" aria-label="Chọn lại loại tài khoản">
          ← Chọn lại loại tài khoản
        </Link>
      }
      footer={null}
    >
      <RegistrationForm mode="landlord" />
    </AuthPageShell>
  );
}
