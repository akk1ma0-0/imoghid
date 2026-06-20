import { useEffect, useRef } from "react";
import type { FlowTx } from "../types";

export function Step8Asp({
  tx,
  reload,
}: {
  tx: FlowTx;
  reload: () => Promise<void>;
}) {
  const marked = useRef(false);

  // При входе на шаг 8 фиксируем завершение (completedAt) один раз.
  useEffect(() => {
    if (!tx.completedAt && !marked.current) {
      marked.current = true;
      fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: 8 }),
      }).then(() => reload());
    }
  }, [tx.id, tx.completedAt, reload]);

  return (
    <div className="asp-hero">
      <div className="asp-icon">🏛</div>
      <div className="asp-title">Agenția Servicii Publice (ASP)</div>
      <div className="asp-sub">
        Programare pentru înregistrarea de stat a transferului dreptului de proprietate.
      </div>
      <a href="https://programare.asp.gov.md" className="asp-btn" target="_blank" rel="noopener noreferrer">
        Programați-vă pe ASP.gov.md →
      </a>
      {tx.completedAt && (
        <div style={{ marginTop: 16, fontSize: 12, color: "var(--green)" }}>
          ✓ Traseu parcurs — tranzacția este marcată ca finalizată.
        </div>
      )}
    </div>
  );
}
