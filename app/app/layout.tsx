import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "./imoghid.css";
import { auth } from "@/auth";
import { Providers } from "@/components/Providers";
import { Topbar } from "./_components/Topbar";
import { DemoProvider } from "@/app/contexts/DemoContext";
import { DemoBanner } from "./_components/DemoBanner";
import { DemoTooltip } from "@/app/_components/DemoTooltip";

// Шрифты — браузерная загрузка Google Fonts (как в (auth)), с системными фолбэками в imoghid.css.
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Серверный гейт (defense in depth): не полагаемся только на middleware — клиентский
  // Router Cache может отдать префетч-страницу без запроса к серверу. Вызов auth() здесь
  // делает все /app-страницы динамическими и повторно проверяет сессию на сервере.
  // Demo-режим (cookie imo_demo) — как в middleware — допускается без сессии.
  const session = await auth();
  const isDemo = (await cookies()).get("imo_demo")?.value === "1";
  if (!session?.user?.id && !isDemo) {
    redirect("/login");
  }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <Providers>
        <DemoProvider>
        <div className="ig-root">
          <DemoBanner />
          <Topbar />
          {children}
          <footer className="app-footer">
            <Link href="/despre">Despre ImoGhid</Link>
            <span className="sep">·</span>
            <Link href="/termeni">Termeni și Condiții</Link>
            <span className="sep">·</span>
            <Link href="/confidentialitate">Politică de confidențialitate</Link>
            <span className="sep">·</span>
            <Link href="/faq">Întrebări frecvente</Link>
          </footer>
          <DemoTooltip />
        </div>
        </DemoProvider>
      </Providers>
    </>
  );
}
