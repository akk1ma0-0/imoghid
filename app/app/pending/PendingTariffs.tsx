"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useDemo } from "@/app/contexts/DemoContext";

// Плашки тарифов (plan = null). Две плашки → оплата VictoriaBank. Ручное назначение
// плана админом остаётся параллельным путём. Показывается, когда WAITLIST_MODE выключен.

type Tariff = {
  plan: "BASIC" | "PRO";
  label: string;
  price: string;
  desc: string;
  highlight?: boolean;
};

const TARIFFS: Tariff[] = [
  { plan: "BASIC", label: "Basic", price: "300 MDL", desc: "Plan de bază pentru agenți — text temporar." },
  { plan: "PRO", label: "Pro", price: "500 MDL", desc: "Plan avansat cu toate instrumentele — text temporar.", highlight: true },
];

export function PendingTariffs() {
  const { startDemo } = useDemo();
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="ig-page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginTop: 32, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Alegeți un plan</h1>
        <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6 }}>
          Activați abonamentul pentru a începe. Plata este procesată securizat de VictoriaBank.
        </p>
      </div>

      {/* Согласие с условиями оплаты/возврата — обязательно до перехода на страницу банка (SIP п.7) */}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          maxWidth: 560,
          margin: "18px auto 0",
          fontSize: 13,
          color: "var(--ink2)",
          lineHeight: 1.55,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <span>
          Sunt de acord cu{" "}
          <Link href="/termeni" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #2563eb)" }}>
            Termenii și Condițiile de plată
          </Link>{" "}
          și cu{" "}
          <Link href="/termeni" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #2563eb)" }}>
            Politica de returnare
          </Link>
          .
        </span>
      </label>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        {TARIFFS.map((t) => (
          <div
            key={t.plan}
            className="card"
            style={t.highlight ? { borderColor: "var(--blue, #2563eb)" } : undefined}
          >
            <div className="card-bd" style={{ padding: "24px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, margin: "8px 0 4px" }}>{t.price}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>/ lună</div>
              <p style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.55, margin: "14px 0 18px", minHeight: 40 }}>
                {t.desc}
              </p>
              <form method="POST" action="/api/payments/vb-initiate">
                <input type="hidden" name="plan" value={t.plan} />
                <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
                <button
                  type="submit"
                  disabled={!agreed}
                  className={t.highlight ? "btn solid" : "btn"}
                  style={{ width: "100%", justifyContent: "center", height: 44 }}
                >
                  Alege planul {t.label}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-bd" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 14 }}>
            Preferați să explorați mai întâi? Încercați platforma în modul demo. Sau contactați
            administratorul pentru activarea manuală a planului.
          </p>
          <button className="btn solid" style={{ marginBottom: 12 }} onClick={startDemo}>
            ✨ Încearcă demo-ul gratuit
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
