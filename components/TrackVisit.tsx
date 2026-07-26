"use client";

import { useEffect } from "react";

// Фиксирует визит на странице воронки (например регистрации) один раз за сессию вкладки.
// UTM читает из URL (без гонки с cookie UtmCapture) и шлёт в /api/track/visit.
export function TrackVisit({ path }: { path: string }) {
  useEffect(() => {
    const key = `visit_tracked_${path}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    const p = new URLSearchParams(window.location.search);
    fetch("/api/track/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        utmSource: p.get("utm_source"),
        utmCampaign: p.get("utm_campaign"),
        utmMedium: p.get("utm_medium"),
      }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);

  return null;
}
