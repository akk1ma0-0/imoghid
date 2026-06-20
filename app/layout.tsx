import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
