"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { InfoMenu } from "./InfoMenu";
import { NotifBell } from "./NotifBell";

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const onCadastru = pathname.startsWith("/app/cadastru");
  const onTransactions = pathname.startsWith("/app/transactions");
  const onObjects = pathname.startsWith("/app/objects");
  const onListings = pathname.startsWith("/app/listings");
  const onTools = pathname.startsWith("/app/acte");
  const onCreator = pathname.startsWith("/app/creator");
  const onAdmin = pathname.startsWith("/app/admin");

  const isAdmin = session?.user?.role === "ADMIN";

  const displayName = session?.user?.name || session?.user?.email || "";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "·";

  return (
    <header className="topbar">
      <div className="logo">
        <div className="logo-icon">IG</div>
        <div>
          <div className="logo-name">ImoGhid</div>
          <span className="logo-sub">Platforma agentului imobiliar · Moldova</span>
        </div>
      </div>
      <nav className="nav">
        <Link href="/app/cadastru" className={`nav-btn${onCadastru ? " active" : ""}`}>
          <span className="nav-ic" aria-hidden>🔍</span>
          <span className="nav-lb">Verificare imobil</span>
          <span className="nav-lb-short" aria-hidden>Verificare</span>
        </Link>
        <Link
          href="/app/transactions/new"
          className={`nav-btn${onTransactions ? " active" : ""}`}
        >
          <span className="nav-ic" aria-hidden>🧭</span>
          <span className="nav-lb">Crează Dosar</span>
          <span className="nav-lb-short" aria-hidden>Dosar</span>
        </Link>
        <Link href="/app/objects" className={`nav-btn${onObjects ? " active" : ""}`}>
          <span className="nav-ic" aria-hidden>📁</span>
          <span className="nav-lb">Obiectele mele</span>
          <span className="nav-lb-short" aria-hidden>Obiecte</span>
        </Link>
        <Link href="/app/acte" className={`nav-btn${onTools ? " active" : ""}`}>
          <span className="nav-ic" aria-hidden>🧰</span>
          <span className="nav-lb">Actele mele</span>
          <span className="nav-lb-short" aria-hidden>Acte</span>
        </Link>
        <Link href="/app/creator" className={`nav-btn${onCreator ? " active" : ""}`}>
          <span className="nav-ic" aria-hidden>✦</span>
          <span className="nav-lb">Creator</span>
          <span className="nav-lb-short" aria-hidden>Creator</span>
        </Link>
        <Link href="/app/listings" className={`nav-btn${onListings ? " active" : ""}`}>
          <span className="nav-ic" aria-hidden>📰</span>
          <span className="nav-lb">Anunțuri 999</span>
          <span className="nav-lb-short" aria-hidden>Anunțuri</span>
          <span className="soon-badge">în curând</span>
        </Link>
      </nav>
      <div className="topbar-r">
        {/* Служебная кнопка админ-панели — рендерится ТОЛЬКО для ADMIN (не скрыта через CSS). */}
        {isAdmin && (
          <Link
            href="/app/admin"
            className={`admin-btn${onAdmin ? " active" : ""}`}
            title="Panou de administrare"
            aria-label="Panou de administrare"
          >
            <span aria-hidden>⚙️</span>
            <span className="admin-btn-lb">Admin</span>
          </Link>
        )}
        <NotifBell />
        <InfoMenu />
        {displayName && (
          <Link
            href="/app/profile"
            className="topbar-name"
            style={{ fontSize: 13, fontWeight: 500, color: "var(--ink2)", textDecoration: "none" }}
          >
            {displayName}
          </Link>
        )}
        <Link
          href="/app/profile"
          className="avatar"
          title="Profilul meu"
          style={{ textDecoration: "none" }}
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
