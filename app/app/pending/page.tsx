"use client";

import { signOut } from "next-auth/react";

// Страница ожидания активации плана (plan = null). Middleware ведёт сюда любого
// авторизованного пользователя без плана.
export default function PendingPage() {
  return (
    <div className="ig-page" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card" style={{ marginTop: 40 }}>
        <div className="card-bd" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>⏳</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            Contul dvs. este în curs de activare
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 24 }}>
            Contactați administratorul pentru activarea planului.
          </p>
          <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
            Deconectați-vă
          </button>
        </div>
      </div>
    </div>
  );
}
