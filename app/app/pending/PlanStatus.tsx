"use client";

import { useState } from "react";
import Link from "next/link";
import type { UsageSummaryRow } from "@/lib/usage";

// Страница статуса плана на /app/pending для пользователей С активным планом (Basic/Pro):
// текущий план, использование лимитов по фичам за период, и действия — докупить «O accesare»
// или (для Basic) перейти на Pro. Плата — через уже существующие VB-роуты.

type Props = {
  plan: "BASIC" | "PRO" | "HUB";
  planExpiresAt: string | null;
  rows: UsageSummaryRow[];
  singleAccessCount: number;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "Activ (fără expirare)";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `Se reînnoiește: ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function PlanStatus({ plan, planExpiresAt, rows, singleAccessCount }: Props) {
  const [agreed, setAgreed] = useState(false);
  const isBasic = plan === "BASIC";
  const isAgencyMember = plan === "HUB"; // тариф выдан агентством — личных покупок не показываем

  return (
    <div className="ig-page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginTop: 32, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Abonamentul tău</h1>
        <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6 }}>
          Planul curent, utilizarea limitelor pentru perioada în curs și opțiuni suplimentare.
        </p>
      </div>

      {/* Текущий план */}
      <div className="card" style={{ marginTop: 16, borderColor: "var(--blue, #2563eb)" }}>
        <div
          className="card-bd"
          style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#fff",
              background: "var(--blue, #2563eb)",
              padding: "6px 14px",
              borderRadius: 999,
            }}
          >
            {plan === "PRO" ? "Pro" : plan === "HUB" ? "HUB/Agenție" : "Basic"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink3)" }}>{fmtDate(planExpiresAt)}</div>
          {singleAccessCount > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink2)", marginLeft: "auto" }}>
              Accese unice disponibile: <b>{singleAccessCount}</b>
            </div>
          )}
        </div>
      </div>

      {/* Использование лимитов */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-hd">
          <b>Utilizarea limitelor (perioada curentă)</b>
        </div>
        <div className="card-bd" style={{ padding: "8px 22px 18px" }}>
          {rows.map((r) => {
            const status = r.unavailable
              ? "Indisponibil (doar Pro)"
              : r.unlimited
                ? `${r.used} · nelimitat`
                : `${r.used} / ${r.limit}`;
            const pct = !r.unavailable && !r.unlimited && r.limit > 0
              ? Math.min(100, Math.round((r.used / r.limit) * 100))
              : 0;
            return (
              <div key={r.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--line, #eef0f2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--ink2)", textTransform: "capitalize" }}>{r.labelRo}</span>
                  <span style={{ color: r.unavailable ? "var(--ink4, #9ca3af)" : "var(--ink)", fontWeight: 600 }}>
                    {status}
                  </span>
                </div>
                {!r.unavailable && !r.unlimited && (
                  <div style={{ height: 6, borderRadius: 4, background: "var(--line, #eef0f2)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: pct >= 100 ? "#dc2626" : "var(--blue, #2563eb)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Участник агентства (HUB) — тариф выдан агентством, личных покупок/апгрейда нет. */}
      {isAgencyMember && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-bd" style={{ padding: "16px 22px", fontSize: 13, color: "var(--ink2)", lineHeight: 1.6 }}>
            Cont în cadrul unui abonament <b>HUB/Agenție</b>. Locurile și plata sunt gestionate de
            administratorul agenției.
          </div>
        </div>
      )}

      {/* Согласие + личные покупки — только для персональных планов (Basic/Pro), не для HUB. */}
      {!isAgencyMember && (
      <>
      {/* Согласие с условиями — общий чекбокс для платёжных форм ниже */}
      <label
        style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "18px auto 0", maxWidth: 560, fontSize: 13, color: "var(--ink2)", lineHeight: 1.55, cursor: "pointer" }}
      >
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Sunt de acord cu{" "}
          <Link href="/termeni" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #2563eb)" }}>
            Termenii de plată și Politica de returnare
          </Link>
          .
        </span>
      </label>

      {/* «O accesare» — докупить разовый доступ */}
      <div className="card" style={{ marginTop: 12 }}>
        <div
          className="card-bd"
          style={{ padding: "18px 22px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, justifyContent: "space-between" }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>O accesare — 30 MDL</div>
            <p style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.5, margin: 0 }}>
              1 verificare cadastrală + 1 examinare dosar + 1 obiect, suplimentar față de plan.
            </p>
          </div>
          <form method="POST" action="/api/payments/vb-single-access-initiate" style={{ flex: "0 0 auto" }}>
            <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
            <button type="submit" disabled={!agreed} className="btn" style={{ justifyContent: "center", height: 44 }}>
              Cumpără — 30 MDL
            </button>
          </form>
        </div>
      </div>

      {/* Апгрейд на Pro (только для Basic) */}
      {isBasic && (
        <div className="card" style={{ marginTop: 12, borderColor: "var(--blue, #2563eb)" }}>
          <div
            className="card-bd"
            style={{ padding: "18px 22px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, justifyContent: "space-between" }}
          >
            <div style={{ flex: "1 1 260px", minWidth: 240 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Treceți la Pro — 500 MDL / lună</div>
              <p style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.5, margin: 0 }}>
                Verificări cadastrale și obiecte nelimitate, 60 examinări dosar, Anunțuri 999.
              </p>
            </div>
            <form method="POST" action="/api/payments/vb-initiate" style={{ flex: "0 0 auto" }}>
              <input type="hidden" name="plan" value="PRO" />
              <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
              <button type="submit" disabled={!agreed} className="btn solid" style={{ justifyContent: "center", height: 44 }}>
                Treceți la Pro
              </button>
            </form>
          </div>
        </div>
      )}
      </>
      )}

      <div style={{ textAlign: "center", marginTop: 20 }}>
        <Link className="btn" href="/app" style={{ justifyContent: "center" }}>
          ← Înapoi la aplicație
        </Link>
      </div>
    </div>
  );
}
