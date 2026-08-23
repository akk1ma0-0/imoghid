"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// Экран на /payment-result после оплаты. Проблема, которую решает: браузер возвращается сюда
// НЕЗАВИСИМО от server-to-server callback банка (который создаёт грант «O accesare» / активирует
// план). Если сразу дёрнуть useSession().update(), он может отработать ДО callback'а и записать
// в cookie hasSingleAccess=false → edge-middleware не пустит в приложение (застревание на тарифах).
//
// Решение: опрашиваем сессию через update() (он же освежает cookie-токен из БД), пока доступ
// реально не появится (грант создан / план активирован), затем делаем ПОЛНУЮ навигацию в /app,
// чтобы edge-middleware увидел уже освежённую cookie. Реальная выдача грантов — в callback.
export function PostPaymentEntry() {
  const { update } = useSession();
  const [phase, setPhase] = useState<"waiting" | "timeout">("waiting");

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const MAX_MS = 45_000;
    const STEP_MS = 1500;

    (async () => {
      while (!cancelled && Date.now() - startedAt < MAX_MS) {
        let ready = false;
        try {
          // update() перевыпускает JWT-cookie из свежих данных БД и возвращает сессию.
          const s = await update();
          ready = !!(s?.user?.hasSingleAccess || s?.user?.plan);
        } catch {
          /* сеть/временная ошибка — пробуем ещё */
        }
        if (cancelled) return;
        if (ready) {
          // Полная навигация (не soft router.push): edge-middleware получит освежённую cookie.
          window.location.assign("/app");
          return;
        }
        await new Promise((r) => setTimeout(r, STEP_MS));
      }
      if (!cancelled) setPhase("timeout");
    })();

    return () => {
      cancelled = true;
    };
  }, [update]);

  const btnStyle: React.CSSProperties = {
    display: "inline-block",
    background: "#1d4ed8",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    padding: "11px 22px",
    borderRadius: 8,
  };

  if (phase === "timeout") {
    return (
      <div>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 12 }}>
          Confirmarea durează mai mult decât de obicei. Puteți continua — dacă accesul nu apare,
          reîmprospătați pagina peste câteva momente.
        </p>
        <button type="button" onClick={() => window.location.assign("/app")} style={btnStyle}>
          Mergeți la cont →
        </button>
      </div>
    );
  }

  return (
    <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.65 }}>
      Se activează accesul… vă rugăm așteptați câteva secunde.
    </p>
  );
}
