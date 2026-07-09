"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

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
  const signedOut = useRef(false);

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

  // ── Смена e-mail: адрес уже изменён в БД; завершаем текущую сессию, чтобы вход был по новому адресу ──
  useEffect(() => {
    if (!isChange || status !== "success" || signedOut.current) return;
    if (authStatus === "loading") return;
    signedOut.current = true;
    if (authStatus === "authenticated") {
      signOut({ redirect: false }).catch(() => {});
    }
  }, [isChange, status, authStatus]);

  // ── Экран смены e-mail ──
  if (isChange) {
    if (status === "success") {
      return (
        <div style={box()}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Adresa a fost actualizată</h1>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
              Noua adresă de e-mail a fost confirmată. Autentificați-vă cu noua adresă.
            </p>
            <Link href="/login" style={btn}>Autentificare →</Link>
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
          <Link href="/login" style={btn}>Autentificare →</Link>
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
