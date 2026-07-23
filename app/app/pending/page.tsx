"use client";

import { signOut } from "next-auth/react";
import { useDemo } from "@/app/contexts/DemoContext";

// Страница выбора тарифа / ожидания активации (plan = null). Middleware ведёт сюда любого
// авторизованного пользователя без плана. Две плашки тарифов → оплата VictoriaBank.
// Ручное назначение плана админом остаётся параллельным путём (не удалено).

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

export default function PendingPage() {
  const { startDemo } = useDemo();

  return (
    <div className="ig-page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginTop: 32, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Alegeți un plan</h1>
        <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6 }}>
          Activați abonamentul pentru a începe. Plata este procesată securizat de VictoriaBank.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 20,
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
                <button
                  type="submit"
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
