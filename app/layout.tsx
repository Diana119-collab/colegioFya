import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistencia - Fe y Alegría 17",
  description: "Sistema de asistencia I.E. Fe y Alegría 17, Villa El Salvador",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
