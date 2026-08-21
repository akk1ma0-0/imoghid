"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// Кнопка «в приложение» на /payment-result. После оплаты (в т.ч. «O accesare») освежает JWT
// через useSession().update() — тем самым обновляет cookie-токен (hasSingleAccess/сессия),
// чтобы edge-middleware сразу пустил пользователя в приложение, а не бросил на /app/pending
// из-за устаревшего до-оплатного токена. Реальная выдача грантов — в server-to-server callback.
export function ContinueToApp() {
  const { update } = useSession();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    let done = false;
    update().finally(() => {
      if (!done) setRefreshing(false);
    });
    return () => {
      done = true;
    };
  }, [update]);

  return (
    <button
      type="button"
      onClick={() => router.push("/app")}
      style={{
        display: "inline-block",
        background: "#1d4ed8",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        padding: "11px 22px",
        borderRadius: 8,
        opacity: refreshing ? 0.75 : 1,
      }}
    >
      {refreshing ? "Se actualizează contul…" : "Mergeți la cont →"}
    </button>
  );
}
