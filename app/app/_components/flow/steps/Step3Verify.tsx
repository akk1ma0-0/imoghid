import { useEffect, useState } from "react";
import type { FlowTx, FlowField, FlowFlag } from "../types";

function val(fields: FlowField[], oi: number, name: string): string | null {
  return fields.find((f) => f.objectIndex === oi && f.fieldName === name)?.value ?? null;
}
function owners(fields: FlowField[], oi: number): FlowField[] {
  return fields.filter((f) => f.objectIndex === oi && f.fieldName === "owner_name");
}
function noticeColor(flag: FlowFlag): string {
  if (flag.code === "LEGAL_ENTITY_SELLER") return "orange";
  if (flag.severity === "RED") return "red";
  if (flag.severity === "GREEN") return "green";
  return "amber";
}

function FieldsTable({ fields, oi }: { fields: FlowField[]; oi: number }) {
  const areaAct = val(fields, oi, "area_act");
  const areaExtras = val(fields, oi, "area_extras");
  const mismatch =
    areaAct && areaExtras && areaAct.replace(",", ".") !== areaExtras.replace(",", ".");
  const ow = owners(fields, oi);
  return (
    <table className="ftbl">
      <tbody>
        <tr>
          <td className="k">Număr cadastral</td>
          <td className="v">{val(fields, oi, "cadastralNo") || "—"}</td>
        </tr>
        <tr>
          <td className="k">Adresă</td>
          <td className="v">{val(fields, oi, "address") || "—"}</td>
        </tr>
        <tr>
          <td className="k">Proprietar(i)</td>
          <td className="v">
            {ow.length === 0 && "—"}
            {ow.map((o) => (
              <div
                key={o.id}
                style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
              >
                {o.value}
                <span className={`tag ${o.isActualized ? "tag-green" : "tag-amber"}`}>
                  {o.isActualized ? "actualizat" : "date neactualizate"}
                </span>
              </div>
            ))}
          </td>
        </tr>
        <tr>
          <td className="k">Suprafața conf. act de drept</td>
          <td className="v" style={mismatch ? { color: "var(--red)" } : undefined}>
            {areaAct ? `${areaAct} m²` : "—"}
            {mismatch ? " ← discrepanță" : ""}
          </td>
        </tr>
        <tr>
          <td className="k">Suprafața conf. extras</td>
          <td className="v">{areaExtras ? `${areaExtras} m²` : "—"}</td>
        </tr>
        <tr>
          <td className="k">Temeiul dreptului</td>
          <td className="v">{val(fields, oi, "legal_basis") || "—"}</td>
        </tr>
        <tr>
          <td className="k">Sarcini/Grevări</td>
          <td className="v" style={{ color: "var(--green)" }}>
            {val(fields, oi, "encumbrances") || "Nu au fost identificate"}
          </td>
        </tr>
        <tr>
          <td className="k">Suma din actul de proprietate</td>
          <td className="v">
            {val(fields, oi, "purchase_price")
              ? `${Number(val(fields, oi, "purchase_price")).toLocaleString("ro-MD")} MDL`
              : "—"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Notices({ flags }: { flags: FlowFlag[] }) {
  return (
    <>
      {flags.map((f) => (
        <div className={`notice ${noticeColor(f)}`} key={f.id}>
          <div className="notice-dot" />
          <div>
            <b>{f.titleRo}</b>
            {f.descriptionRo && <p>{f.descriptionRo}</p>}
            {f.legalRefUrl && (
              <p style={{ marginTop: 4 }}>
                <a
                  href={f.legalRefUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--blue)", fontSize: 11 }}
                >
                  {f.legalRef || "Act normativ"} ↗
                </a>
              </p>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// Счётчик анализов (серый текст под заголовком). Перечитывается после анализа.
function UsageCounter({ refreshKey }: { refreshKey: number }) {
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    fetch("/api/analysis-usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsage({ used: d.used, limit: d.limit }))
      .catch(() => {});
  }, [refreshKey]);
  if (!usage) return null;
  return (
    <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: -12, marginBottom: 14 }}>
      Analize utilizate: {usage.used} / {usage.limit}
    </div>
  );
}

export function Step3Verify({ tx }: { tx: FlowTx }) {
  const analyzed = tx.extractedFields.length > 0 || tx.flags.length > 0;
  const counter = <UsageCounter refreshKey={tx.extractedFields.length} />;
  if (!analyzed) {
    return (
      <>
        {counter}
        <div className="notice blue">
          <div className="notice-dot" />
          <div>
            <b>Verificarea nu a fost încă lansată</b>
            <p>Reveniți la pasul 2, încărcați documente și apăsați „Continuați → verificarea actelor”.</p>
          </div>
        </div>
      </>
    );
  }

  if (tx.dealType === "SCHIMB") {
    const f1 = tx.flags.filter((f) => f.objectIndex === 1);
    const f2 = tx.flags.filter((f) => f.objectIndex === 2);
    return (
      <div>
        {counter}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-hd" style={{ background: "var(--blue-bg)" }}>
              <b style={{ color: "var(--blue)" }}>Obiect 1 · Câmpuri extrase</b>
            </div>
            <div className="card-bd">
              <FieldsTable fields={tx.extractedFields} oi={1} />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-hd" style={{ background: "var(--purple-bg)" }}>
              <b style={{ color: "var(--purple)" }}>Obiect 2 · Câmpuri extrase</b>
            </div>
            <div className="card-bd">
              <FieldsTable fields={tx.extractedFields} oi={2} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--blue)", marginBottom: 6 }}>
          Semnale · Obiect 1
        </div>
        <Notices flags={f1} />
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--purple)", marginTop: 14, marginBottom: 6 }}>
          Semnale · Obiect 2
        </div>
        <Notices flags={f2} />
      </div>
    );
  }

  return (
    <div>
      {counter}
      <div className="card">
        <div className="card-hd">
          <b>Câmpuri extrase</b>
          <span className="badge b-gray" style={{ marginLeft: "auto" }}>
            Extras
          </span>
        </div>
        <div className="card-bd">
          <FieldsTable fields={tx.extractedFields} oi={1} />
        </div>
      </div>
      <Notices flags={tx.flags} />
    </div>
  );
}
