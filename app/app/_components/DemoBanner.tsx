"use client";

import { useDemo } from "@/app/contexts/DemoContext";

// Фиксированный баннер режима демо — над обычным топбаром.
export function DemoBanner() {
  const { isDemoMode, exit } = useDemo();
  if (!isDemoMode) return null;

  function onExit() {
    if (confirm("Doriți să ieșiți din demo și să creați o tranzacție reală?")) {
      exit("real");
    }
  }

  return (
    <div className="demo-banner">
      <span>🎯 Mod Demo — explorați platforma cu date de test</span>
      <button type="button" className="demo-banner-exit" onClick={onExit}>
        Ieși din demo →
      </button>
    </div>
  );
}
