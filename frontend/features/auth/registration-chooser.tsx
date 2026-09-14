import Link from "next/link";
import { Icon, type IconName } from "../../components/ui/icon";

interface RegistrationChoice {
  readonly href: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly action: string;
}

const choices: readonly RegistrationChoice[] = [
  {
    href: "/register/tenant",
    icon: "search",
    title: "Tôi muốn tìm phòng",
    description: "Khám phá phòng theo khu vực và ngân sách, lưu lựa chọn rồi chủ động liên hệ.",
    action: "Tạo tài khoản người thuê"
  },
  {
    href: "/register/landlord",
    icon: "building",
    title: "Tôi muốn cho thuê",
    description: "Tạo và quản lý tin phòng cho thuê, rồi theo dõi trao đổi với người thuê.",
    action: "Tạo tài khoản chủ nhà"
  }
];

export function RegistrationChooser() {
  return (
    <div className="space-y-5">
      <nav aria-label="Chọn mục đích tạo tài khoản" className="grid gap-4">
        {choices.map((choice) => (
          <Link
            key={choice.href}
            href={choice.href}
            className="rm-auth-choice group relative flex items-start gap-4 rounded-card border border-border bg-surface p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <span className="rm-auth-choice-icon grid h-11 w-11 flex-none place-items-center rounded-control bg-primary-subtle text-primary">
              <Icon name={choice.icon} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-ui-base font-bold text-foreground">{choice.title}</strong>
              <span className="mt-1 block text-ui-sm leading-6 text-muted-foreground">{choice.description}</span>
              <span className="mt-3 inline-flex items-center gap-2 text-ui-sm font-bold text-primary-hover">
                {choice.action}
                <Icon name="arrow" className="rm-auth-choice-arrow h-4 w-4" />
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
