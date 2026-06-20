import type { ReactNode } from "react";
import "./auth.css";
import { Providers } from "@/components/Providers";

// Шрифты грузятся браузером из Google Fonts (как в исходном дизайне),
// без сборочной зависимости. Есть системные фолбэки в auth.css.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <Providers>
        <div className="auth-root">{children}</div>
      </Providers>
    </>
  );
}
