"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { UsageSummaryRow } from "@/lib/usage";
import type { PlanKind } from "@/lib/plan-display";
import { fmtDateChisinau, planExpiryLabel } from "@/lib/date-chisinau";

// Страница статуса плана на /app/pending для пользователей С активным планом:
// текущий план и срок, использование лимитов по фичам за период, и действия — смена плана /
// выход из агентства / докупить «O accesare» / (для Basic) перейти на Pro.
// Откуда план (PlanKind) и какой срок показывать — общее правило lib/plan-display.ts.

type Props = {
  plan: "BASIC" | "PRO" | "HUB";
  kind: PlanKind;
  planExpiresAt: string | null; // уже выбранная на сервере дата (агентства для HUB по членству)
  agencyExpiresAt: string | null; // срок агентства (участник / владелец), для пояснения
  rows: UsageSummaryRow[];
  singleAccessCount: number;
  // Причина, по которой личный Basic/Pro купить нельзя (владелец активного агентства /
  // участник), — с сервера (personalPlanPurchaseBlock); null = покупка разрешена.
  personalPlanBlockedMsg?: string | null;
};

// Подписи из FEATURE_LABEL_RO — в нижнем регистре (они же используются внутри фраз ошибок).
// Делаем заглавной только первую букву: CSS text-transform: capitalize превращал
// «anunțuri 999.md» в «Anunțuri 999.Md» и «obiecte active» в «Obiecte Active».
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const LEAVE_TEXT =
  "Ieșind din agenție pierdeți accesul la planul HUB. Datele dumneavoastră (dosare, obiecte, " +
  "documente) rămân în contul dumneavoastră. Locul se eliberează pentru alt agent.";

export function PlanStatus({
  plan,
  kind,
  planExpiresAt,
  agencyExpiresAt,
  rows,
  singleAccessCount,
  personalPlanBlockedMsg = null,
}: Props) {
  const [agreed, setAgreed] = useState(false);
  const isBasic = plan === "BASIC";
  const isHub = plan === "HUB"; // тариф выдан агентством — личных покупок не показываем

  // Модалка выхода из агентства: "leave" — кнопка «Părăsește agenția»; "change" — «Schimbați
  // planul» у участника (тот же выход, с пояснением, зачем он нужен).
  const { update } = useSession();
  const [leaveMode, setLeaveMode] = useState<"leave" | "change" | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function confirmLeave() {
    setLeaveBusy(true);
    setLeaveError(null);
    try {
      const r = await fetch("/api/agency/leave", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Nu s-a putut părăsi agenția.");
      // Освежаем JWT из БД (plan=null), затем полная навигация — edge-middleware увидит новую cookie.
      await update();
      window.location.assign("/app/pending");
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : "Eroare.");
      setLeaveBusy(false);
    }
  }

  const expiryLabel = planExpiryLabel(planExpiresAt);

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
          <div style={{ fontSize: 13, color: "var(--ink3)" }}>{expiryLabel}</div>
          {singleAccessCount > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink2)", marginLeft: "auto" }}>
              Accese unice disponibile: <b>{singleAccessCount}</b>
            </div>
          )}
        </div>
      </div>

      {/* Пояснение к сроку для участника агентства. */}
      {kind === "agencyMember" && agencyExpiresAt && (
        <p style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.55, margin: "8px 4px 0" }}>
          Abonamentul agenției expiră la {fmtDateChisinau(agencyExpiresAt)}. Prelungirea este
          gestionată de administratorul agenției.
        </p>
      )}

      {/* Действия с планом — по роли. */}
      {kind === "personal" && (
        <div style={{ marginTop: 12 }}>
          <Link className="btn" href="/app/pending?change=1" style={{ justifyContent: "center" }}>
            Schimbați planul
          </Link>
        </div>
      )}
      {kind === "agencyMember" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setLeaveMode("change")}>
            Schimbați planul
          </button>
          <button type="button" className="btn" onClick={() => setLeaveMode("leave")}>
            Părăsește agenția
          </button>
        </div>
      )}
      {kind === "agencyOwner" && (
        <div style={{ marginTop: 12 }}>
          <Link className="btn" href="/app/agency" style={{ justifyContent: "center" }}>
            Gestionează agenția
          </Link>
          <p style={{ fontSize: 12.5, color: "var(--ink3)", margin: "6px 0 0" }}>
            Planul HUB se gestionează din pagina Agenție.
            {agencyExpiresAt && <> Abonamentul agenției expiră la {fmtDateChisinau(agencyExpiresAt)}.</>}
          </p>
        </div>
      )}

      {/* Использование лимитов */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-hd">
          <b>Utilizarea limitelor (perioada curentă)</b>
        </div>
        <div className="card-bd" style={{ padding: "8px 22px 18px" }}>
          {rows.map((r) => {
            const status = r.unavailable
              ? "Indisponibil pe planul curent"
              : r.unlimited
                ? `${r.used} · nelimitat`
                : `${r.used} / ${r.limit}`;
            const pct = !r.unavailable && !r.unlimited && r.limit > 0
              ? Math.min(100, Math.round((r.used / r.limit) * 100))
              : 0;
            return (
              <div key={r.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--line, #eef0f2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--ink2)" }}>{capFirst(r.labelRo)}</span>
                  <span style={{ color: r.unavailable ? "var(--ink4, #9ca3af)" : "var(--ink)", fontWeight: 600, whiteSpace: "nowrap" }}>
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
      {kind === "agencyMember" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-bd" style={{ padding: "16px 22px", fontSize: 13, color: "var(--ink2)", lineHeight: 1.6 }}>
            Cont în cadrul unui abonament <b>HUB/Agenție</b>. Locurile și plata sunt gestionate de
            administratorul agenției.
          </div>
        </div>
      )}

      {/* Согласие + личные покупки — только для персональных планов (Basic/Pro), не для HUB. */}
      {!isHub && (
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

      {/* Личный план недоступен (владелец активного агентства) — пояснение вместо оплаты Pro. */}
      {isBasic && personalPlanBlockedMsg && (
        <p style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.55, margin: "12px 4px 0" }}>
          {personalPlanBlockedMsg}
        </p>
      )}

      {/* Апгрейд на Pro (только для Basic) */}
      {isBasic && !personalPlanBlockedMsg && (
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

      {/* Модалка выхода из агентства (общая для «Părăsește agenția» и «Schimbați planul»). */}
      {leaveMode && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !leaveBusy && setLeaveMode(null)}
        >
          <div className="modal-box" style={{ maxWidth: 480 }} role="dialog" aria-modal="true">
            <div className="modal-hd">
              <h2>Părăsește agenția</h2>
            </div>
            <div className="modal-bd" style={{ fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.6 }}>
              {leaveMode === "change" && (
                <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
                  Pentru a schimba planul, mai întâi ieșiți din agenție.
                </p>
              )}
              <p style={{ margin: 0 }}>{LEAVE_TEXT}</p>
              {leaveError && (
                <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--red, #dc2626)" }}>{leaveError}</p>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
                <button type="button" className="btn" disabled={leaveBusy} onClick={() => setLeaveMode(null)}>
                  Anulează
                </button>
                <button type="button" className="btn solid" disabled={leaveBusy} onClick={confirmLeave}>
                  {leaveBusy ? "Se procesează…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
