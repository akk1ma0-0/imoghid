"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

function box(): React.CSSProperties {
  return {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    textAlign: "center",
  };
}

const btn: React.CSSProperties = {
  display: "inline-block",
  background: "#1d4ed8",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 20px",
  borderRadius: 8,
};

function Inner() {
  const params = useSearchParams();
  const status = params.get("status") ?? "invalid";
  const isChange = params.get("type") === "change";
  const router = useRouter();
  const { status: authStatus, update } = useSession();
  const [working, setWorking] = useState(status === "success");
  const ran = useRef(false);

  // ── Регистрация: подтверждение текущего e-mail → обновить сессию, увести на выбор плана ──
  useEffect(() => {
    if (isChange) return; // смена e-mail обрабатывается отдельным эффектом ниже
    if (status !== "success" || ran.current) return;
    if (authStatus === "loading") return;
    ran.current = true;
    (async () => {
      if (authStatus === "authenticated") {
        try {
          await update({ emailConfirmed: true });
        } catch {
          /* ignore */
        }
        router.replace("/app/pending");
      } else {
        setWorking(false);
      }
    })();
  }, [isChange, status, authStatus, update, router]);

  // ── Экран смены e-mail (сессия НЕ завершается — текущая вкладка остаётся рабочей) ──
  if (isChange) {
    if (status === "success") {
      return (
        <div style={box()}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Adresa a fost actualizată</h1>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
              Adresa de e-mail a fost actualizată cu succes.
            </p>
            <Link href="/app/profile" style={btn}>Înapoi la profil →</Link>
          </div>
        </div>
      );
    }
    const expired = status === "expired";
    return (
      <div style={box()}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            {expired ? "Linkul a expirat" : "Link invalid"}
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
            {expired
              ? "Linkul de confirmare a expirat (valabil 24 de ore). Reluați schimbarea adresei din profil."
              : "Linkul de confirmare nu este valid, a fost deja folosit sau adresa nu mai este disponibilă. Adresa contului a rămas neschimbată."}
          </p>
          <Link href="/app/profile" style={btn}>Înapoi la profil →</Link>
        </div>
      </div>
    );
  }

  // ── Экран верификации при регистрации ──
  if (status === "success") {
    return (
      <div style={box()}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>E-mail confirmat</h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
            {working ? "Vă redirecționăm…" : "Adresa a fost confirmată. Autentificați-vă pentru a continua."}
          </p>
          {!working && (
            <Link href="/login" style={btn}>
              Autentificare →
            </Link>
          )}
        </div>
      </div>
    );
  }

  const expired = status === "expired";
  return (
    <div style={box()}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
          {expired ? "Linkul a expirat" : "Link invalid"}
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
          {expired
            ? "Linkul de confirmare a expirat (valabil 24 de ore). Solicitați un e-mail nou."
            : "Linkul de confirmare nu este valid sau a fost deja folosit."}
        </p>
        <Link
          href={authStatus === "authenticated" ? "/app/verify-email-pending" : "/login"}
          style={btn}
        >
          {authStatus === "authenticated" ? "Retrimiteți e-mailul →" : "Autentificare →"}
        </Link>
      </div>
    </div>
  );
}

export default function EmailVerificatPage() {
  return (
    <Suspense fallback={<div style={box()} />}>
      <Inner />
    </Suspense>
  );
}
