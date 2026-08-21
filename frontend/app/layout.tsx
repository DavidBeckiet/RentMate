import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "../components/ui/app-shell";
import { AuthProvider } from "../lib/auth/auth-provider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap"
});

export const metadata: Metadata = {
  title: "RentMate - Nền Tảng Cho Thuê Phòng Trọ & Căn Hộ Cao Cấp",
  description: "Nền tảng kết nối người thuê và chủ nhà thông minh, minh bạch tại Thành phố Hồ Chí Minh."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={`${plusJakartaSans.variable} font-sans`}>
      <body className="antialiased selection:bg-teal-500/20 selection:text-teal-900">
        <AuthProvider>
          <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
