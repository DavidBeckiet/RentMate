import { Button } from "../../components/ui/button";

export function GoogleAuthSeam({ mode }: Readonly<{ mode: "login" | "register" }>) {
  const availabilityId = `google-${mode}-availability`;
  const label = mode === "login" ? "Đăng nhập nhanh bằng Google" : "Đăng ký nhanh bằng Google";

  return (
    <div className="rm-auth-google-seam space-y-2 pt-1">
      <div className="rm-auth-divider flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-ui-xs font-semibold text-muted-foreground">hoặc</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled
        aria-describedby={availabilityId}
        className="rm-auth-google w-full"
      >
        <span
          aria-hidden="true"
          className="rm-google-mark grid h-6 w-6 place-items-center rounded-full font-sans text-ui-sm font-bold"
        >
          G
        </span>
        {label}
      </Button>
      <p id={availabilityId} className="rm-auth-google-status text-center text-ui-xs font-medium text-muted-foreground">
        Sắp hỗ trợ
      </p>
    </div>
  );
}
