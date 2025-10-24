import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Landslide Sentinel — Map Prototype",
  description: "Base Google Maps view with sensor markers and dashboard overlay.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
