import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { UtmCapture } from "@/components/UtmCapture";

export const metadata: Metadata = {
  title: "ImoGhid · Platforma agentului imobiliar",
  description: "Ghidul tranzacției imobiliare în Republica Moldova — verificare acte, cadastru, calcule.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <Suspense fallback={null}>
          <UtmCapture />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
