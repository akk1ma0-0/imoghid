"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

// Экран на /payment-result после оплаты. Браузер возвращается сюда НЕЗАВИСИМО от server-to-server
// callback банка (который активирует план / создаёт грант «O accesare»). Задача компонента —
// дождаться, пока доступ реально появится, и уйти в /app.
//
// ВАЖНО про cookie: полная навигация в /app пройдёт edge-middleware только с ОСВЕЖЁННОЙ JWT-cookie.
// Единственное место, где cookie перевыпускается из свежих данных БД, — запрос к /api/auth/session
// (его и делает useSession().update()). Поэтому window.location.assign('/app') зовём ТОЛЬКО после
// успешного update() (он вернул сессию → значит Set-Cookie применён). Иначе middleware увидит
// устаревший plan=null и вернёт на /app/pending.
//
// Почему через ref и пустые зависимости эффекта: в next-auth v5 функция update() пересоздаётся при
// каждом изменении session/loading (useMemo по [session, loading]). Если завязать poll-эффект на
// [update], он перезапускается на каждый вызов update() → окно таймаута (45s) вечно сбрасывается
// (fallback-кнопка не появляется), а конкурирующие перезапуски дёргают update() при loading=true,
// где он короткозамыкается (`if (loading) return`) и возвращает undefined. Держим update() в ref и
// запускаем ЕДИНСТВЕННЫЙ цикл с фиксированным окном таймаута.
export function PostPaymentEntry({ initialActive = false }: { initialActive?: boolean }) {
  const { update } = useSession();
  const updateRef = useRef(update);
  updateRef.current = update;

  const [phase, setPhase] = useState<"waiting" | "timeout">("waiting");

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const MAX_MS = 45_000;
    const STEP_MS = 1500;

    (async () => {
      while (!cancelled && Date.now() - startedAt < MAX_MS) {
        // update() перевыпускает JWT-cookie из БД и возвращает свежую сессию. undefined → он
        // короткозамкнулся на loading или сеть-ошибка: cookie не тронут, просто пробуем ещё.
        let refreshed: Awaited<ReturnType<typeof update>> | undefined;
        try {
          refreshed = await updateRef.current();
        } catch {
          /* сеть — пробуем ещё */
        }
        if (cancelled) return;

        if (refreshed) {
          // Сюда дошли только с реальным ответом /api/auth/session → cookie уже освежён.
          // initialActive: сервер уже подтвердил доступ (перезагрузка после активации) — уходим
          // сразу. Иначе — ждём, пока в сессии появится план/разовый доступ.
          const u = refreshed.user;
          const ready = initialActive || !!(u?.plan || u?.hasSingleAccess);
          if (ready) {
            window.location.assign("/app");
            return;
          }
        }
        await new Promise((r) => setTimeout(r, STEP_MS));
      }
      if (!cancelled) setPhase("timeout");
    })();

    return () => {
      cancelled = true;
    };
    // initialActive — стабильный серверный проп; эффект стартует один раз.
  }, [initialActive]);

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
      {initialActive
        ? "Contul este activ — vă redirecționăm…"
        : "Se activează accesul… vă rugăm așteptați câteva secunde."}
    </p>
  );
}
