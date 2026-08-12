"use client";

import type { ReactNode } from "react";
import type { UserRole } from "../../types/api";
import { useAuth } from "./auth-provider";

export interface AuthGuardProps {
  readonly children: ReactNode;
  readonly allowedRoles?: readonly UserRole[];
  readonly loadingFallback?: ReactNode;
  readonly anonymousFallback?: ReactNode;
  readonly errorFallback?: ReactNode;
  readonly forbiddenFallback?: ReactNode;
}

export function AuthGuard({
  children,
  allowedRoles,
  loadingFallback = <p aria-live="polite">Đang kiểm tra tài khoản…</p>,
  anonymousFallback = <p>Vui lòng đăng nhập để tiếp tục.</p>,
  errorFallback = <p role="alert">Không thể kiểm tra tài khoản lúc này.</p>,
  forbiddenFallback = <p role="alert">Tài khoản này không có quyền truy cập nội dung.</p>
}: AuthGuardProps) {
  const { status, user } = useAuth();

  if (status === "loading") return loadingFallback;
  if (status === "anonymous") return anonymousFallback;
  if (status === "error") return errorFallback;
  if (!user || (allowedRoles && !allowedRoles.includes(user.role))) return forbiddenFallback;

  // This guard controls frontend UX only; backend authorization remains authoritative.
  return children;
}
