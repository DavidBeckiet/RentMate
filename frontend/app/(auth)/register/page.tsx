import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { RegistrationChooser } from "../../../features/auth/registration-chooser";

export default function RegisterPage() {
  return (
    <AuthPageShell
      variant="chooser"
      title="Tạo tài khoản"
      description="Bạn muốn sử dụng RentMate để làm gì?"
      footer={null}
    >
      <RegistrationChooser />
    </AuthPageShell>
  );
}
