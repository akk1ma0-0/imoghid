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

function Inner() {
  const params = useSearchParams();
  const status = params.get("status") ?? "invalid";
  const router = useRouter();
  const { status: authStatus, update } = useSession();
  const [working, setWorking] = useState(status === "success");
  const ran = useRef(false);

  useEffect(() => {
    if (status !== "success" || ran.current) return;
    if (authStatus === "loading") return;
    ran.current = true;
    (async () => {
      if (authStatus === "authenticated") {
        // Обновляем JWT (emailVerified) и уводим на следующий шаг — назначение плана.
        try {
          await update({ emailConfirmed: true });
        } catch {
          /* ignore */
        }
        router.replace("/app/pending");
      } else {
        // Подтверждено в другом браузере/устройстве — просим войти.
        setWorking(false);
      }
    })();
  }, [status, authStatus, update, router]);

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
            <Link href="/login" style={{ display: "inline-block", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 8 }}>
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
          style={{ display: "inline-block", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 8 }}
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
