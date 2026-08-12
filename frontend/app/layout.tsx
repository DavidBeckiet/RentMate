import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/ui/app-shell";
import { AuthProvider } from "../lib/auth/auth-provider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "RentMate",
  description: "Nền tảng kết nối người thuê và chủ nhà tại Thành phố Hồ Chí Minh."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
