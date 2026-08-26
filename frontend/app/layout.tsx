import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Manrope, Space_Grotesk } from "next/font/google";
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

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  variable: "--font-space-grotesk",
  display: "swap"
});

export const metadata: Metadata = {
  title: "RentMate — Chạm đúng nơi, sống đúng chất",
  description: "Khám phá phòng trọ và căn hộ minh bạch, trực quan, đúng nhu cầu trên RentMate."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={`${manrope.variable} ${spaceGrotesk.variable}`}>
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
