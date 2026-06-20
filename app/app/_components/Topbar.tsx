"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const onCadastru = pathname.startsWith("/app/cadastru");
  const onTransactions = pathname.startsWith("/app/transactions");
  const onObjects = pathname.startsWith("/app/objects");
  const onListings = pathname.startsWith("/app/listings");
  const onTools = pathname.startsWith("/app/instrumente");

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
          Verificare imobil
        </Link>
        <Link
          href="/app/transactions/new"
          className={`nav-btn${onTransactions ? " active" : ""}`}
        >
          Ghidul tranzacției
        </Link>
        <Link href="/app/objects" className={`nav-btn${onObjects ? " active" : ""}`}>
          Obiectele mele
        </Link>
        <Link href="/app/instrumente" className={`nav-btn${onTools ? " active" : ""}`}>
          Instrumente
        </Link>
        <Link href="/app/listings" className={`nav-btn${onListings ? " active" : ""}`}>
          Anunțuri 999 <span className="cnt">10</span>
        </Link>
      </nav>
      <div className="topbar-r">
        {displayName && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink2)" }}>
            {displayName}
          </span>
        )}
        <button
          className="avatar"
          title="Ieșire din cont"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
