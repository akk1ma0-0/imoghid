import type { ReactNode } from "react";
import Link from "next/link";
import { cookies, headers } from "next/headers";
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
  const isAuthed = !!session?.user?.id;

  // Публичная страница тарифов /app/pending доступна анонимно (SIP — публичная страница
  // цен). Путь пробрасывает middleware через заголовок x-pathname. Для остальных /app-путей
  // без сессии — редирект на /login (defense in depth, как раньше).
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isPublicPending = pathname.startsWith("/app/pending");
  if (!isAuthed && !isDemo && !isPublicPending) {
    redirect("/login");
  }

  const fonts = (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
    </>
  );

  // Анонимный посетитель на публичной странице тарифов — лёгкий каркас без app-topbar
  // (навигация ведёт в защищённую зону, ему там нечего делать). Только бренд + вход.
  if (!isAuthed && !isDemo) {
    return (
      <>
        {fonts}
        <Providers>
          <DemoProvider>
            <div className="ig-root">
              <header className="topbar">
                <Link href="/" className="logo" style={{ textDecoration: "none" }}>
                  <div className="logo-icon">IG</div>
                  <div>
                    <div className="logo-name">ImoGhid</div>
                    <span className="logo-sub">Platforma agentului imobiliar · Moldova</span>
                  </div>
                </Link>
                <nav className="nav">
                  <Link href="/login" className="nav-btn">Autentificare</Link>
                  <Link href="/register" className="nav-btn">Înregistrare</Link>
                </nav>
              </header>
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
            </div>
          </DemoProvider>
        </Providers>
      </>
    );
  }

  return (
    <>
      {fonts}
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
