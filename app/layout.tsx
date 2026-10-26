import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "StormShield · Extreme Weather Alerts & Emergency Response",
  description:
    "StormShield predicts severe weather, finds who is in harm's way, sends alerts in 11 South African languages and tracks who is safe.",
};

export const viewport: Viewport = {
  themeColor: "#070b10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
