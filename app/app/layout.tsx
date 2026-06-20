import type { ReactNode } from "react";
import "./imoghid.css";
import { Providers } from "@/components/Providers";
import { Topbar } from "./_components/Topbar";

// Шрифты — браузерная загрузка Google Fonts (как в (auth)), с системными фолбэками в imoghid.css.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <Providers>
        <div className="ig-root">
          <Topbar />
          {children}
        </div>
      </Providers>
    </>
  );
}
