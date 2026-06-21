"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Plan = "BASIC" | "PRO";

export default function SubscribePage() {
  const router = useRouter();
  const { status, update } = useSession();

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"BASIC" | "PRO" | "invite" | null>(
    null,
  );
  const [inviteCode, setInviteCode] = useState("");

  // Подписку выбирает уже зарегистрированный пользователь.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=/subscribe");
    }
  }, [status, router]);

  async function activate(
    payload: { plan: Plan } | { inviteCode: string },
    busy: "BASIC" | "PRO" | "invite",
  ) {
    setError(null);
    setPending(busy);

    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setPending(null);
      setError(data?.error || "Nu s-a putut activa abonamentul.");
      return;
    }

    // Обновляем JWT/сессию, чтобы middleware на /app увидел активную подписку.
    await update({ plan: data.plan, planActive: true });

    router.push("/app");
    router.refresh();
  }

  return (
    <div className="sub-page">
      <div className="sub-logo">
        <div className="sub-logo-icon">IG</div>
        <div className="sub-logo-name">ImoGhid</div>
      </div>

      <div className="sub-head">
        <h1>Alegeți planul potrivit</h1>
        <p>
          Accesul la platformă necesită un abonament activ. Anulați oricând.
        </p>
      </div>

      {error && (
        <div
          className="error-msg"
          style={{ maxWidth: 680, width: "100%", marginBottom: 16 }}
        >
          <span>✕</span>
          <span>{error}</span>
        </div>
      )}

      <div className="plans">
        {/* BASIC */}
        <div className="plan-card">
          <div className="plan-name">Basic</div>
          <div className="plan-price">
            <sup>$</sup>10<sub>/lună</sub>
          </div>
          <div className="plan-desc">
            Acces complet la toate funcțiile principale ale platformei.
          </div>
          <ul className="plan-features">
            <li>
              <span className="feat-check">✓</span>
              <span>Ghidul tranzacției — 8 pași</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Verificare automată acte</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Anunțuri 999.md în timp real</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Calculator impozit și notariat</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Calculator credit ipotecar</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Lista neagră · contacte private</span>
            </li>
            <li>
              <span className="feat-x">✕</span>
              <span>Rapoarte PDF pentru client</span>
            </li>
            <li>
              <span className="feat-x">✕</span>
              <span>Generator anunțuri</span>
            </li>
            <li>
              <span className="feat-x">✕</span>
              <span>Analiză de piață CMA</span>
            </li>
          </ul>
          <button
            className="plan-btn"
            disabled={pending !== null}
            onClick={() => activate({ plan: "BASIC" }, "BASIC")}
          >
            {pending === "BASIC" ? "Se activează…" : "Alegeți Basic — $10"}
          </button>
        </div>

        {/* PRO */}
        <div className="plan-card featured">
          <div className="plan-badge">Recomandat</div>
          <div className="plan-name">Pro</div>
          <div className="plan-price">
            <sup>$</sup>30<sub>/lună</sub>
          </div>
          <div className="plan-desc">
            Toate funcțiile Basic plus instrumentele avansate pentru
            profesioniști.
          </div>
          <ul className="plan-features">
            <li>
              <span className="feat-check">✓</span>
              <span>Tot ce include Basic</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Rapoarte PDF branding pentru client</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Generator anunțuri (RO + RU)</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Analiză de piață CMA (999.md)</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Istoric extins prețuri anunțuri</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Obiectele mele — portofoliu complet</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Acte/Contracte — șabloane</span>
            </li>
            <li>
              <span className="feat-check">✓</span>
              <span>Suport prioritar</span>
            </li>
          </ul>
          <button
            className="plan-btn primary"
            disabled={pending !== null}
            onClick={() => activate({ plan: "PRO" }, "PRO")}
          >
            {pending === "PRO" ? "Se activează…" : "Alegeți Pro — $30"}
          </button>
        </div>
      </div>

      {/* Cod invitație */}
      <div className="invite-section">
        <div className="inv-label">
          <b>Aveți cod de invitație PRO?</b>
          Introduceți-l și planul PRO se activează automat, fără plată.
        </div>
        <div className="invite-inp-row">
          <input
            type="text"
            placeholder="IMOTEST2025"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <button
            disabled={pending !== null || !inviteCode.trim()}
            onClick={() =>
              activate({ inviteCode: inviteCode.trim() }, "invite")
            }
          >
            {pending === "invite" ? "…" : "Activați"}
          </button>
        </div>
      </div>

      <div className="sub-note">
        Plata se procesează securizat prin Stripe · Visa / Mastercard.
        <br />
        Anulare oricând din contul dvs. · Fără angajamente pe termen lung.
        <br />
        <a href="#">Termeni de utilizare</a> ·{" "}
        <a href="#">Politică de confidențialitate</a>
      </div>
    </div>
  );
}
