"use client";

import { useState } from "react";
import { LAW_TAGS } from "./constants";

// Правая панель шага: «Acte normative» + дисклеймер + контакт.
// На десктопе (≥1025px) всегда раскрыта (toggle скрыт через CSS).
// На планшете/мобильном — аккордеон, свёрнут по умолчанию.
export function RightRail() {
  const [open, setOpen] = useState(false);

  return (
    <aside className="rrail">
      <button
        type="button"
        className="rrail-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Acte normative & informații</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      <div className="rrail-body" data-open={open}>
        <div className="rules-card">
          <div className="rules-hd">
            <b>Acte normative</b>
            <span>editabilă</span>
          </div>
          <div className="rules-bd">
            <p>Se schimbă legea — se modifică regula, nu programul.</p>
            <div className="law-tags">
              {LAW_TAGS.map((t) => (
                <a
                  className="law-tag"
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={t.label}
                >
                  {t.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="disclaimer">
          Platforma sugerează și marchează, dar nu autentifică. Responsabilitatea finală
          pentru tranzacție revine notarului și agentului.
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
          <p style={{ fontSize: 12, color: "var(--ink3)", lineHeight: 1.6, margin: "0 0 8px" }}>
            Pentru consultanță extinsă, vă rugăm să contactați un expert imobiliar.
          </p>
          <p style={{ fontSize: 12, color: "var(--ink3)", lineHeight: 1.6, margin: "0 0 10px" }}>
            Platforma ImoGhid a fost elaborată în colaborare cu{" "}
            <b style={{ color: "var(--ink2)" }}>Liudmila Popovscaia</b>, jurist în domeniu imobiliar.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qr-liudmila.png"
            alt="QR contact Liudmila Popovscaia"
            style={{ width: "100%", maxWidth: 220, borderRadius: "var(--r)", display: "block" }}
          />
        </div>
      </div>
    </aside>
  );
}
