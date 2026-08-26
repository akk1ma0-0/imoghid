"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useDemo } from "@/app/contexts/DemoContext";

// Плашки тарифов (plan = null). Две плашки → оплата VictoriaBank. Ручное назначение
// плана админом остаётся параллельным путём. Показывается, когда WAITLIST_MODE выключен.

type Tariff = {
  plan: "BASIC" | "PRO" | "HUB";
  label: string;
  price: string;
  priceUnit?: string; // единица под ценой; по умолчанию "/ lună", у HUB — "/ loc"
  priceNote?: string; // доп. строка под единицей (у HUB — "minim 3 locuri")
  // Список фич плана. Формат строки: "Denumire — limită"; часть после " — " рендерится
  // справа как лимит, строки без " — " — как фича без лимита.
  features: string[];
  highlight?: boolean;
  // HUB идёт ДРУГИМ флоу: не прямая оплата vb-initiate (как Basic/Pro), а переход на
  // /app/agency (выбор числа мест, минимум 3 → там оплата vb-agency-initiate). Anon → /register.
  agencyCta?: boolean;
  footnote?: string; // мелкая сноска под CTA (у HUB — про договорной тариф)
};

const TARIFFS: Tariff[] = [
  {
    plan: "BASIC",
    label: "Basic",
    price: "300 MDL",
    features: [
      "Verificare cadastrală — 50/lună",
      "Examinarea dosarului — 30/lună",
      "Obiectele mele — 20/lună",
      "Check-list acte",
      "Tipuri de acte ale imobilului",
      "Actele Mele — set complet",
      "Creator Hub — 20 postări/lună",
    ],
  },
  {
    plan: "PRO",
    label: "Pro",
    price: "500 MDL",
    highlight: true,
    features: [
      "Verificare cadastrală — nelimitat",
      "Examinarea dosarului — 60/lună",
      "Obiectele mele — nelimitat",
      "Check-list acte",
      "Tipuri de acte ale imobilului",
      "Actele Mele — set complet",
      "Creator Hub — 60 postări/lună",
      "Anunțuri 999 — 60/lună",
    ],
  },
  {
    plan: "HUB",
    label: "HUB / Agenție",
    price: "450 MDL",
    priceUnit: "/ loc",
    priceNote: "minim 3 locuri",
    agencyCta: true,
    footnote: "Pentru agenții cu mai mulți utilizatori, tariful poate fi negociat — contactați-ne.",
    features: [
      "Verificare cadastrală — nelimitat",
      "Examinarea dosarului — 70/lună",
      "Obiectele mele — nelimitat",
      "Check-list acte",
      "Tipuri de acte ale imobilului",
      "Actele Mele — set complet",
      "Creator Hub — 70/lună",
      "Anunțuri 999 — 70/lună",
    ],
  },
];

export function PendingTariffs({ isAuthenticated = true }: { isAuthenticated?: boolean }) {
  const { startDemo } = useDemo();
  const [agreed, setAgreed] = useState(false);

  // Оболочка расширена до 1200px, чтобы 3 карточки тарифов были заметно шире (контент ~1148px →
  // ~372px на карточку, список фич не сжат). Остальной контент (интро, «O accesare», demo) сам
  // сужен обратно до 720px через maxWidth + margin auto, чтобы не растягиваться на всю ширину.
  return (
    <div className="ig-page" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginTop: 32, marginBottom: 8, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {isAuthenticated ? "Alegeți un plan" : "Planuri și prețuri"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6 }}>
          {isAuthenticated
            ? "Activați abonamentul pentru a începe. Plata este procesată securizat de VictoriaBank."
            : "Creați un cont pentru a activa un abonament. Plata este procesată securizat de VictoriaBank."}
        </p>
      </div>

      {/* Согласие с условиями оплаты/возврата — обязательно до перехода на страницу банка (SIP п.7).
          Только для залогиненных (у анонимного оплаты нет — он идёт на регистрацию). */}
      {isAuthenticated && (
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
      )}

      <div
        style={{
          display: "grid",
          // Оболочка .ig-page расширена до 1200px (padding 26 по бокам → контент ~1148px). minmax
          // min=240px — это порог переноса: при 1fr карточки растягиваются до ~372px (3 шт),
          // а на узких экранах auto-fit сам сворачивает ряд в 2 → 1 колонку (адаптив сохранён).
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          alignItems: "stretch",
          gap: 16,
          marginTop: 16,
        }}
      >
        {TARIFFS.map((t) => (
          <div
            key={t.plan}
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              ...(t.highlight ? { borderColor: "var(--blue, #2563eb)" } : {}),
            }}
          >
            <div
              className="card-bd"
              style={{ padding: "24px 22px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column" }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, margin: "8px 0 4px" }}>{t.price}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>{t.priceUnit ?? "/ lună"}</div>
              {t.priceNote && (
                <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 2 }}>{t.priceNote}</div>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 18px", textAlign: "left" }}>
                {t.features.map((f) => {
                  const i = f.indexOf(" — ");
                  const name = i >= 0 ? f.slice(0, i) : f;
                  const limit = i >= 0 ? f.slice(i + 3) : null;
                  return (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 10,
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        padding: "7px 0",
                        borderTop: "1px solid var(--line, #eef0f2)",
                      }}
                    >
                      <span style={{ color: "var(--ink2)" }}>{name}</span>
                      {limit && (
                        <span style={{ color: "var(--ink3)", fontWeight: 600, whiteSpace: "nowrap" }}>{limit}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {/* Нижний блок карточки: marginTop:auto прижимает CTA (+сноску) к низу, чтобы
                  разная высота контента (priceNote/footnote/список фич) не смещала кнопки. */}
              <div style={{ marginTop: "auto" }}>
                {t.agencyCta ? (
                  // HUB: не прямая оплата — переход на /app/agency (выбор мест, min 3) / регистрация.
                  <Link
                    href={isAuthenticated ? "/app/agency" : "/register"}
                    className={t.highlight ? "btn solid" : "btn"}
                    style={{ width: "100%", justifyContent: "center", height: 44 }}
                  >
                    {isAuthenticated ? "Cumpără locuri" : "Înregistrează-te"}
                  </Link>
                ) : isAuthenticated ? (
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
                ) : (
                  <Link
                    href="/register"
                    className={t.highlight ? "btn solid" : "btn"}
                    style={{ width: "100%", justifyContent: "center", height: 44 }}
                  >
                    Înregistrează-te
                  </Link>
                )}
                {t.footnote && (
                  <p style={{ fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.5, margin: "10px 0 0", textAlign: "left" }}>
                    {t.footnote}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* «O accesare» — разовая покупка без подписки (Этап C): 1 verificare + 1 dosar + 1 obiect. */}
      <div className="card" style={{ marginTop: 16, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <div
          className="card-bd"
          style={{ padding: "20px 22px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, justifyContent: "space-between" }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              O accesare — 30 MDL <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink3)" }}>· acces unic, fără abonament</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.55, margin: 0 }}>
              Un singur pachet: <b>1 verificare cadastrală</b> + <b>1 examinare dosar</b> + <b>1 obiect</b>.
              Se consumă o singură dată, nu se reînnoiește.
            </p>
          </div>
          <div style={{ flex: "0 0 auto", minWidth: 200 }}>
            {isAuthenticated ? (
              <form method="POST" action="/api/payments/vb-single-access-initiate">
                <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
                <button
                  type="submit"
                  disabled={!agreed}
                  className="btn"
                  style={{ width: "100%", justifyContent: "center", height: 44 }}
                >
                  Cumpără o accesare — 30 MDL
                </button>
              </form>
            ) : (
              <Link
                href="/register"
                className="btn"
                style={{ width: "100%", justifyContent: "center", height: 44 }}
              >
                Înregistrează-te
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <div className="card-bd" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 14 }}>
            Preferați să explorați mai întâi? Încercați platforma în modul demo. Sau contactați
            administratorul pentru activarea manuală a planului.
          </p>
          <button className="btn solid" style={{ marginBottom: 12 }} onClick={startDemo}>
            ✨ Încearcă demo-ul gratuit
          </button>
          <div>
            {isAuthenticated ? (
              <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
                Deconectați-vă
              </button>
            ) : (
              <Link className="btn" href="/login" style={{ justifyContent: "center" }}>
                Aveți deja cont? Autentificați-vă
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
