"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, type ReactNode } from "react";
import { LoadingState } from "../../components/ui/feedback-states";
import { useAuth } from "../../lib/auth/auth-provider";

export interface AuthPageShellProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

export function AuthPageShell({ title, description, children, footer }: AuthPageShellProps) {
  const router = useRouter();
  const { status } = useAuth();
  const headingId = useId();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [router, status]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="mx-auto w-full max-w-md">
        <LoadingState message={status === "loading" ? "Đang kiểm tra tài khoản…" : "Đang chuyển hướng…"} />
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <header>
          <h1 id={headingId} className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 leading-7 text-slate-600">{description}</p>
        </header>
        <div className="mt-8">{children}</div>
        <footer className="mt-8 border-t border-stone-200 pt-6 text-sm leading-6 text-slate-600">{footer}</footer>
      </div>
    </section>
  );
}
