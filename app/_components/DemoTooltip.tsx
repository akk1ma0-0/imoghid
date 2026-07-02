"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDemo } from "@/app/contexts/DemoContext";
import { TOTAL_STAGES } from "@/lib/demo-flow";

// Печатает текст в input посимвольно (через нативный сеттер + input-событие → React подхватывает).
function typeInto(el: HTMLInputElement, text: string, onCancelRef: { cancelled: boolean }) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  let i = 0;
  const step = () => {
    if (onCancelRef.cancelled) return;
    i++;
    setter?.call(el, text.slice(0, i));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (i < text.length) setTimeout(step, 50);
  };
  step();
}

export function DemoTooltip() {
  const { isDemoMode, current, index, steps, next, back, exit, restart, finalOpen, setFinalOpen, returnToTour } =
    useDemo();
  const pathname = usePathname();
  const onContext = !!current && pathname === current.page;

  // Подсветка целевого элемента (spotlight) + автоскролл.
  useEffect(() => {
    document.querySelectorAll(".demo-highlight").forEach((el) => el.classList.remove("demo-highlight"));
    if (!isDemoMode || finalOpen || !current?.highlight || !onContext) return;
    const t = setTimeout(() => {
      const el = document.querySelector(current.highlight!);
      if (el) {
        el.classList.add("demo-highlight");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [current, onContext, isDemoMode, finalOpen]);

  // Авто-заполнение (typewriter).
  useEffect(() => {
    if (!isDemoMode || finalOpen || current?.action !== "auto-fill" || !current.value || !current.highlight || !onContext)
      return;
    const ref = { cancelled: false };
    const t = setTimeout(() => {
      const el = document.querySelector(current.highlight!) as HTMLInputElement | null;
      if (el) typeInto(el, current.value!, ref);
    }, 500);
    return () => {
      ref.cancelled = true;
      clearTimeout(t);
    };
  }, [current, onContext, isDemoMode, finalOpen]);

  if (!isDemoMode || !current) return null;

  // ── Финальный модал ──
  if (finalOpen) {
    return (
      <div className="demo-final-overlay">
        <div className="demo-final">
          <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
          <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 14 }}>Ați explorat ImoGhid complet!</h2>
          <div style={{ textAlign: "left", margin: "0 auto 20px", maxWidth: 260, fontSize: 14, color: "var(--ink2)", lineHeight: 1.9 }}>
            <div>Ați văzut:</div>
            <div>✓ Verificare imobil</div>
            <div>✓ Ghidul tranzacției (8 pași)</div>
            <div>✓ Obiectele mele</div>
            <div>✓ Actele mele</div>
            <div>✓ Creator Hub</div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={restart}>← Reia demo-ul</button>
            <button className="btn solid" onClick={() => exit("register")}>Creați cont gratuit →</button>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = (current.stage / TOTAL_STAGES) * 100;
  const isFirst = index === 0;

  return (
    <div className="demo-tooltip" key={index}>
      <div className="demo-tooltip-hd">
        <div className="demo-tooltip-prog">
          <div className="demo-tooltip-prog-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="demo-tooltip-meta">
          <span>Etapa {current.stage} / {TOTAL_STAGES} · {current.stageTitle}</span>
          <button className="demo-tooltip-x" title="Ieși din demo" onClick={() => exit("app")}>×</button>
        </div>
      </div>

      <div className="demo-tooltip-bd">
        {onContext ? (
          current.tooltip
        ) : (
          <>
            Continuați turul pentru a vedea această funcție în context.
            <button className="demo-tooltip-return" onClick={returnToTour}>Reveniți la tur →</button>
          </>
        )}
      </div>

      {onContext && (
        <div className="demo-tooltip-ft">
          <button className="demo-tooltip-back" disabled={isFirst} onClick={back}>← Înapoi</button>
          <button className="demo-tooltip-next" onClick={() => (current.action === "end-demo" ? setFinalOpen(true) : next())}>
            {current.action === "end-demo" ? "Finalizați ✓" : "Continuă →"}
          </button>
        </div>
      )}
    </div>
  );
}
