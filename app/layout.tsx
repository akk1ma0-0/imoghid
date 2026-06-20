import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Next App",
  description: "Next.js + TypeScript + Tailwind + Prisma + PostgreSQL",
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
