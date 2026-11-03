"use client";

import { useEffect, useRef, useState } from "react";

import { recurringConsentText, TERMS_CONSENT_TEXT } from "@/lib/recurring-consent";

// Клиент Unified Checkout v1 (JS API: VAS.UnifiedCheckout → createCheckout → mount).
// Форма карты — в iframe CyberSource: номер карты и CVV не проходят ни через наш фронт, ни через
// сервер. Библиотека грузится по URL и SRI-хешу из capture context. С completeMandate
// (autoProcessing по умолчанию) mount() возвращает JWT результата; сервер его не принимает на
// веру — перечитывает транзакцию у CyberSource (/api/payments/cs/complete).
type Intent = { purpose: "SUBSCRIPTION" | "AGENCY_SEATS"; plan: string; seats: number | null; takeOwnerSeat: boolean };

type UcCheckout = { mount(target: string): Promise<string>; destroy?(): void };
type UcClient = { createCheckout(opts: { autoProcessing: boolean }): Promise<UcCheckout>; destroy?(): void };
declare global {
  interface Window {
    VAS?: { UnifiedCheckout(captureContext: string): Promise<UcClient> };
  }
}

function loadLibrary(src: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.VAS) return resolve();
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

export function CheckoutClient(props: {
  intent: Intent;
  description: string;
  amount: string;
  currency: string;
  consentVersion: string;
}) {
  const [terms, setTerms] = useState(false);
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
    // Транзакция оплаты индексируется у CyberSource с задержкой в секунды — повторяем с
    // нарастающей паузой: 12 попыток, 1 → 7,6 с (около минуты в сумме).
    for (let i = 0; i < 12; i++) {
      const r = await fetch("/api/payments/cs/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, result }),
      }).catch(() => null);
      const data = (await r?.json().catch(() => null)) as { status?: string } | null;
      if (data?.status === "paid" || data?.status === "already_paid") {
        window.location.assign("/payment-result");
        return;
      }
      if (data?.status === "declined") {
        setPhase("error");
        setMessage("Plata a fost refuzată de bancă. Verificați datele cardului sau încercați alt card.");
        return;
      }
      if (data?.status === "failed" || data?.status === "not_found") {
        setPhase("error");
        setMessage("Plata nu a putut fi confirmată. Contactați-ne la info@biseeth.md — vom verifica tranzacția.");
        return;
      }
      await wait(Math.min(1000 + i * 600, 8000));
    }
    setPhase("error");
    setMessage("Plata se verifică. Abonamentul se va activa automat după confirmare — reveniți peste câteva minute.");
  }

  async function start() {
    if (!terms || !recurring) return;
    setPhase("loading");
    setMessage(null);
    try {
      const r = await fetch("/api/payments/cs/capture-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...props.intent,
          agreedToTerms: true,
          agreedToRecurring: true,
          consentVersion: props.consentVersion,
        }),
      });
      const data = (await r.json().catch(() => null)) as
        | { paymentId: string; captureContext: string; clientLibrary: string; clientLibraryIntegrity: string; error?: string }
        | null;
      if (!r.ok || !data?.captureContext) {
        setPhase("error");
        setMessage(data?.error ?? "Plata nu poate fi inițiată acum.");
        return;
      }
      await loadLibrary(data.clientLibrary, data.clientLibraryIntegrity);
      if (!window.VAS) throw new Error("no VAS");
      const client = await window.VAS.UnifiedCheckout(data.captureContext);
      const checkout = await client.createCheckout({ autoProcessing: true });
      ucRef.current = { client, checkout };
      setPhase("card");
      const result = await checkout.mount("#uc-buttons");
      await complete(data.paymentId, result);
    } catch (e) {
      const reason = (e as { reason?: string; name?: string })?.reason;
      setPhase("error");
      setMessage(
        reason === "UNUSED_TARGET_ORIGINS"
          ? "Pagina de plată nu este configurată pentru acest domeniu."
          : "Plata nu a fost finalizată. Puteți încerca din nou.",
      );
    }
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--ink3)", marginBottom: 18 }}>
        {props.description} — <b style={{ color: "var(--ink)" }}>{props.amount} {props.currency} / lună</b>
      </p>

      <div className="card">
        <div className="card-bd" style={{ padding: 20 }}>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={terms} disabled={phase !== "consent"} onChange={(e) => setTerms(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              {TERMS_CONSENT_TEXT}{" "}
              <a href="/termeni" target="_blank" rel="noopener noreferrer">Termeni și Condiții</a>
            </span>
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={recurring} disabled={phase !== "consent"} onChange={(e) => setRecurring(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{recurringConsentText(props.amount, props.currency)}</span>
          </label>

          {phase === "consent" && (
            <button className="btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={!terms || !recurring} onClick={start}>
              Continuă spre plată →
            </button>
          )}
          {phase === "loading" && <p style={{ fontSize: 13, color: "var(--ink3)" }}>Se pregătește plata securizată…</p>}
          {phase === "verifying" && <p style={{ fontSize: 13, color: "var(--ink3)" }}>Se verifică plata, nu închideți pagina…</p>}
          {/* Кнопки/форма Unified Checkout (iframe CyberSource). */}
          <div id="uc-buttons" style={{ display: phase === "card" ? "block" : "none", marginTop: 8 }} />

          {message && (
            <div className="notice amber" style={{ marginTop: 14 }}>
              <div className="notice-dot" />
              <div>
                <b>{message}</b>
                {phase === "error" && (
                  <p style={{ margin: "6px 0 0" }}>
                    <a href="/app/pending">← Înapoi la abonament</a>
                  </p>
                )}
              </div>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 14, lineHeight: 1.5 }}>
            Datele cardului se introduc într-o fereastră securizată a procesatorului de plăți și nu ajung la ImoGhid.
            Plata poate necesita confirmare 3-D Secure de la banca dvs.
          </p>
        </div>
      </div>
    </div>
  );
}
