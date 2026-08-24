import Link from "next/link";
import { Icon, type IconName } from "../../components/ui/icon";

interface RegistrationChoice {
  readonly href: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

const choices: readonly RegistrationChoice[] = [
  {
    href: "/register/tenant",
    icon: "search",
    title: "Tôi muốn tìm phòng",
    description: "Tìm, lưu và liên hệ với chủ trọ."
  },
  {
    href: "/register/landlord",
    icon: "building",
    title: "Tôi muốn cho thuê",
    description: "Đăng và quản lý phòng cho thuê."
  }
];

export function RegistrationChooser() {
  return (
    <div className="space-y-5">
      <nav aria-label="Chọn mục đích tạo tài khoản" className="grid gap-3 sm:grid-cols-2">
        {choices.map((choice) => (
          <Link
            key={choice.href}
            href={choice.href}
            className="rm-auth-choice group relative flex min-h-28 flex-col items-start gap-3 overflow-hidden rounded-card border border-border bg-background px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <span className="flex w-full items-center justify-between gap-3">
              <span className="rm-auth-choice-icon grid h-11 w-11 flex-none place-items-center rounded-control bg-primary-subtle text-primary">
                <Icon name={choice.icon} />
              </span>
              <Icon name="arrow" className="rm-auth-choice-arrow h-5 w-5 flex-none text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-ui-base font-bold text-foreground">{choice.title}</strong>
              <span className="mt-1 block text-ui-sm text-muted-foreground">{choice.description}</span>
            </span>
          </Link>
        ))}
      </nav>
      <p className="text-center text-ui-sm text-muted-foreground">
        Đã có tài khoản?{" "}
        <Link
          href="/login"
          className="font-bold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
