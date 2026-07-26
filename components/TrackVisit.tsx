"use client";

import { useEffect } from "react";

// Читает или создаёт анонимный visitor_id (cookie, 30 дней) — стабильный между визитами,
// связывает визит с аккаунтом при последующей регистрации.
function ensureVisitorId(): string {
  const existing = document.cookie
    .split("; ")
    .find((c) => c.startsWith("visitor_id="));
  if (existing) return decodeURIComponent(existing.slice("visitor_id=".length));

  const id = crypto.randomUUID();
  const maxAge = 60 * 60 * 24 * 30; // 30 дней (как UTM)
  document.cookie = `visitor_id=${id}; path=/; max-age=${maxAge}; samesite=lax`;
  return id;
}

// Фиксирует визит на странице воронки (например регистрации) один раз за сессию вкладки.
// UTM читает из URL (без гонки с cookie UtmCapture); visitorId — из/в cookie.
export function TrackVisit({ path }: { path: string }) {
  useEffect(() => {
    const visitorId = ensureVisitorId(); // cookie ставим всегда (идемпотентно)

    const key = `visit_tracked_${path}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    const p = new URLSearchParams(window.location.search);
    fetch("/api/track/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        visitorId,
        utmSource: p.get("utm_source"),
        utmCampaign: p.get("utm_campaign"),
        utmMedium: p.get("utm_medium"),
      }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);

  return null;
}
