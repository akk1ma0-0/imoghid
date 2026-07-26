"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useDemo } from "@/app/contexts/DemoContext";

type Locale = "ro" | "ru";

const TEXT: Record<Locale, { title: string; lines: string[]; demo: string; logout: string }> = {
  ro: {
    title: "Bine ai venit! Ești printre primii.",
    lines: [
      "Pregătim deja lansarea.",
      "Imediat ce deschidem accesul, îți trimitem invitația pe e-mail.",
      "Până atunci — folosește funcțiile gratuite și explorează platforma.",
    ],
    demo: "✨ Explorează platforma (demo)",
    logout: "Deconectează-te",
  },
  ru: {
    title: "Добро пожаловать! Ты в числе первых.",
    lines: [
      "Мы уже готовим запуск.",
      "Как только откроем доступ, пришлём тебе приглашение на почту.",
      "А пока — пользуйся бесплатными функциями и знакомься с платформой.",
    ],
    demo: "✨ Познакомиться с платформой (демо)",
    logout: "Выйти",
  },
};

export function WaitlistPanel({ initialLocale }: { initialLocale: Locale }) {
  const { startDemo } = useDemo();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = TEXT[locale];

  async function switchLocale(next: Locale) {
    if (next === locale) return;
    setLocale(next); // оптимистично
    // Сохраняем выбор в БД, чтобы применился при следующем входе.
    fetch("/api/user/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});
  }

  return (
    <div className="ig-page" style={{ maxWidth: 560, margin: "0 auto" }}>
      {/* Переключатель языка — только на этой странице */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 20 }}>
        {(["ro", "ru"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => switchLocale(l)}
            className="btn"
            style={{
              padding: "4px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              ...(l === locale
                ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }
                : {}),
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-bd" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>{t.title}</h1>
          {t.lines.map((line, i) => (
            <p
              key={i}
              style={{
                fontSize: 14.5,
                color: "var(--ink2)",
                lineHeight: 1.65,
                marginBottom: i === t.lines.length - 1 ? 24 : 8,
              }}
            >
              {line}
            </p>
          ))}
          <button className="btn solid" style={{ marginBottom: 12 }} onClick={startDemo}>
            {t.demo}
          </button>
          <div>
            <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
              {t.logout}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
