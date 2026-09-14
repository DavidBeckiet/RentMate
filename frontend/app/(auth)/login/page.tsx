import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { LoginForm } from "../../../features/auth/login-form";

export default function LoginPage() {
  return (
    <AuthPageShell variant="login" title="Đăng nhập" description="Chào mừng bạn quay lại." footer={null}>
      <LoginForm />
    </AuthPageShell>
  );
}
