"use client";

import { useEffect, useRef, useState } from "react";

import { recurringConsentText } from "@/lib/recurring-consent";

// Смена карты через Unified Checkout v1: проверка новой карты без списания (0.00) с 3-D Secure.
// Данные карты вводятся в окне процессора и не проходят ни через наш фронт, ни через сервер.
type UcCheckout = { mount(target: string): Promise<string>; destroy?(): void };
type UcClient = { createCheckout(opts: { autoProcessing: boolean }): Promise<UcCheckout>; destroy?(): void };
type Vas = { UnifiedCheckout(captureContext: string): Promise<UcClient> };
const vas = () => (window as unknown as { VAS?: Vas }).VAS;

function loadLibrary(src: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (vas()) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load"));
    document.head.appendChild(s);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CardChangeClient(props: { amount: string; currency: string; consentVersion: string }) {
  const [recurring, setRecurring] = useState(false);
  const [phase, setPhase] = useState<"consent" | "loading" | "card" | "verifying" | "error">("consent");
  const [message, setMessage] = useState<string | null>(null);
  const ucRef = useRef<{ client?: UcClient; checkout?: UcCheckout }>({});

  useEffect(
    () => () => {
      ucRef.current.checkout?.destroy?.();
      ucRef.current.client?.destroy?.();
    },
    [],
  );

  async function complete(paymentId: string, result: string) {
    setPhase("verifying");
    for (let i = 0; i < 12; i++) {
      const r = await fetch("/api/subscription/card/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, result }),
      }).catch(() => null);
      const data = (await r?.json().catch(() => null)) as { status?: string } | null;
      if (data?.status === "updated" || data?.status === "already_done") {
        window.location.assign("/app/profile?card=updated");
        return;
      }
      if (data?.status === "declined") {
        setPhase("error");
        setMessage("Banca a refuzat verificarea cardului. Încercați alt card.");
        return;
      }
      if (data?.status === "failed" || data?.status === "not_found") {
        setPhase("error");
        setMessage("Cardul nu a putut fi actualizat. Contactați-ne la info@biseeth.md.");
        return;
      }
      await wait(Math.min(1000 + i * 600, 8000));
    }
    setPhase("error");
    setMessage("Verificarea cardului durează mai mult. Reveniți în profil peste câteva minute.");
  }

  async function start() {
    if (!recurring) return;
    setPhase("loading");
    setMessage(null);
    try {
      const r = await fetch("/api/subscription/card/capture-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreedToRecurring: true, consentVersion: props.consentVersion }),
      });
      const data = (await r.json().catch(() => null)) as
        | { paymentId: string; captureContext: string; clientLibrary: string; clientLibraryIntegrity: string; error?: string }
        | null;
      if (!r.ok || !data?.captureContext) {
        setPhase("error");
        setMessage(data?.error ?? "Actualizarea cardului nu poate fi inițiată acum.");
        return;
      }
      await loadLibrary(data.clientLibrary, data.clientLibraryIntegrity);
      const v = vas();
      if (!v) throw new Error("no VAS");
      const client = await v.UnifiedCheckout(data.captureContext);
      const checkout = await client.createCheckout({ autoProcessing: true });
      ucRef.current = { client, checkout };
      setPhase("card");
      const result = await checkout.mount("#uc-buttons");
      await complete(data.paymentId, result);
    } catch {
      setPhase("error");
      setMessage("Cardul nu a fost actualizat. Puteți încerca din nou.");
    }
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--ink3)", marginBottom: 18 }}>
        Introduceți noul card. Nu se debitează nicio sumă acum — banca doar verifică cardul.
      </p>
      <div className="card">
        <div className="card-bd" style={{ padding: 20 }}>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={recurring} disabled={phase !== "consent"} onChange={(e) => setRecurring(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{recurringConsentText(props.amount, props.currency)}</span>
          </label>
          {phase === "consent" && (
            <button className="btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={!recurring} onClick={start}>
              Continuă →
            </button>
          )}
          {phase === "loading" && <p style={{ fontSize: 13, color: "var(--ink3)" }}>Se pregătește fereastra securizată…</p>}
          {phase === "verifying" && <p style={{ fontSize: 13, color: "var(--ink3)" }}>Se verifică cardul, nu închideți pagina…</p>}
          <div id="uc-buttons" style={{ display: phase === "card" ? "block" : "none", marginTop: 8 }} />
          {message && (
            <div className="notice amber" style={{ marginTop: 14 }}>
              <div className="notice-dot" />
              <div>
                <b>{message}</b>
                <p style={{ margin: "6px 0 0" }}>
                  <a href="/app/profile">← Înapoi la profil</a>
                </p>
              </div>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 14, lineHeight: 1.5 }}>
            Datele cardului se introduc într-o fereastră securizată a procesatorului de plăți și nu ajung la ImoGhid.
            Verificarea poate necesita confirmare 3-D Secure de la banca dvs. După actualizare, cardul vechi se șterge.
          </p>
        </div>
      </div>
    </div>
  );
}
