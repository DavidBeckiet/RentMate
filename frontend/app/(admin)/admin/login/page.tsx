import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { LoginForm } from "../../../../features/auth/login-form";

export default function AdminLoginPage() {
  return (
    <AuthPageShell
      title="Đăng nhập quản trị"
      description="Dùng tài khoản quản trị viên để kiểm duyệt RentMate."
      requiredRole="ADMIN"
      successDestination="/admin"
      wrongRoleMessage="Trang này dành cho quản trị viên."
      footer={
        <Link href="/" className="font-semibold text-teal-800 underline decoration-2 underline-offset-4">
          Quay lại trang tìm phòng
        </Link>
      }
    >
      <LoginForm requiredRole="ADMIN" successDestination="/admin" />
    </AuthPageShell>
  );
}
