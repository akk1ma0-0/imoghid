import { STEP_NAV } from "./constants";

export function StepNav({
  step,
  onGo,
  enabled,
}: {
  step: number;
  onGo: (n: number) => void;
  enabled: boolean;
}) {
  return (
    <nav className="lnav">
      <div className="nav-lbl">Ghidul tranzacției</div>
      {STEP_NAV.map((s) => {
        const cls =
          s.n === step ? "active" : s.n < step ? "done" : "";
        return (
          <button
            key={s.n}
            className={`step-item ${cls}`}
            onClick={() => enabled && onGo(s.n)}
            disabled={!enabled}
          >
            <div className="step-num">{s.n}</div>
            <div className="step-txt">
              <b>{s.title}</b>
              <small>{s.sub}</small>
            </div>
            {s.n < 8 && <div className="step-line" />}
          </button>
        );
      })}
      <div className="legend-block">
        <div className="nav-lbl">Zone de verificare</div>
        <div className="leg-row">
          <div className="leg-dot" style={{ background: "var(--green)" }} />
          Verificat conform datelor
        </div>
        <div className="leg-row">
          <div className="leg-dot" style={{ background: "var(--amber)" }} />
          Verificare manuală
        </div>
        <div className="leg-row">
          <div className="leg-dot" style={{ background: "var(--ink4)" }} />
          În afara zonei de verificare
        </div>
      </div>
    </nav>
  );
}
