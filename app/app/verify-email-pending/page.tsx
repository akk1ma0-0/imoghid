"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

export default function VerifyEmailPendingPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/resend-verification", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) {
        setCooldown(d.retryAfter ?? 60);
        setMsg(d.error ?? "Așteptați înainte de a retrimite.");
      } else if (r.ok) {
        if (d.alreadyVerified) {
          setMsg("E-mailul este deja confirmat. Reîncărcați pagina.");
        } else {
          setCooldown(60);
          setMsg("E-mail retrimis ✓ Verificați căsuța poștală.");
        }
      } else {
        setMsg(d.error ?? "Eroare la retrimitere.");
      }
    } catch {
      setMsg("Eroare la retrimitere.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ig-page" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card" style={{ marginTop: 40 }}>
        <div className="card-bd" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📧</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Confirmați adresa de e-mail</h1>
          <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 8 }}>
            Am trimis un e-mail de confirmare la{" "}
            <b style={{ color: "var(--ink2)" }}>{email || "adresa dvs."}</b>.
          </p>
          <p style={{ fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 22 }}>
            Verificați căsuța poștală (și folderul Spam) și accesați linkul de confirmare. Linkul
            este valabil 24 de ore.
          </p>

          {msg && (
            <div className="notice blue" style={{ marginBottom: 16, textAlign: "left" }}>
              <div className="notice-dot" />
              <div><b>{msg}</b></div>
            </div>
          )}

          <button className="btn solid" style={{ marginBottom: 12 }} onClick={resend} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Retrimiteți în ${cooldown}s` : busy ? "Se trimite…" : "Retrimite e-mailul"}
          </button>
          <div>
            <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
              Deconectați-vă
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
