import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Be_Vietnam_Pro, Manrope } from "next/font/google";
import { AppShell } from "../components/ui/app-shell";
import { AuthProvider } from "../lib/auth/auth-provider";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "vietnamese"],
  variable: "--font-manrope",
  display: "swap"
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam-pro",
  display: "swap"
});

export const metadata: Metadata = {
  title: "RentMate — Chạm đúng nơi, sống đúng chất",
  description: "Khám phá phòng trọ và căn hộ minh bạch, trực quan, đúng nhu cầu trên RentMate."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={`${manrope.variable} ${beVietnamPro.variable}`}>
      <body>
        <AuthProvider>
          <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
