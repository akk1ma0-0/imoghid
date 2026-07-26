"use client";

import { useEffect } from "react";

// Захват UTM при заходе на сайт. Первая атрибуция (first-touch): если cookie уже есть —
// не перезаписываем. Живёт 30 дней; читается при регистрации (/api/auth/register).
export function UtmCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = params.get("utm_source");
    if (!src) return;
    if (document.cookie.split("; ").some((c) => c.startsWith("utm_source="))) return; // уже сохранено

    const maxAge = 60 * 60 * 24 * 30; // 30 дней
    const set = (k: string, v: string | null) => {
      if (v) document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=${maxAge}; samesite=lax`;
    };
    set("utm_source", src);
    set("utm_campaign", params.get("utm_campaign"));
    set("utm_medium", params.get("utm_medium"));
  }, []);

  return null;
}
