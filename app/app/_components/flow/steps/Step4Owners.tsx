import { useState } from "react";
import type { FlowTx, FlowOwner } from "../types";

type ToggleField =
  | "acordSotObtained"
  | "tutorApprovalObtained"
  | "foundersDecisionObtained"
  | "dataActualizationDone";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function OwnerCard({
  owner,
  txId,
  reload,
}: {
  owner: FlowOwner;
  txId: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle(field: ToggleField, value: boolean) {
    setBusy(true);
    await fetch(`/api/transactions/${txId}/owners/${owner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await reload();
    setBusy(false);
  }

  const checks: { req: boolean; field: ToggleField; on: boolean; label: string; hint: string }[] = [
    {
      req: owner.acordSotRequired,
      field: "acordSotObtained",
      on: owner.acordSotObtained,
      label: "Acordul soțului/coproprietarilor",
      hint: "Căsătorie sau proprietate comună — acordul este obligatoriu.",
    },
    {
      req: owner.tutorApprovalRequired || owner.isMinor,
      field: "tutorApprovalObtained",
      on: owner.tutorApprovalObtained,
      label: "Autorizația autorității tutelare",
      hint: "Coproprietar minor — autorizația este necesară.",
    },
    {
      req: owner.foundersDecisionRequired || owner.isLegalEntity,
      field: "foundersDecisionObtained",
      on: owner.foundersDecisionObtained,
      label: "Hotărârea fondatorilor",
      hint: "Proprietar persoană juridică.",
    },
    {
      req: owner.dataActualizationRequired,
      field: "dataActualizationDone",
      on: owner.dataActualizationDone,
      label: "Datele personale actualizate în Cadastru",
      hint: "Înregistrarea conține inițiale — necesită actualizare.",
    },
  ];
  const active = checks.filter((c) => c.req);

  return (
    <div className="card">
      <div className="card-hd">
        <b>{owner.fullName}</b>
        <span
          className={`badge ${owner.isActualized ? "b-green" : "b-amber"}`}
          style={{ marginLeft: "auto" }}
        >
          {owner.isActualized ? "actualizat" : "neactualizat"}
        </span>
      </div>
      <div className="card-bd">
        <div className="owner-row">
          <div className="owner-ava">{initials(owner.fullName)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{owner.fullName}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>
              Cotă: {owner.cota ?? "–"}
            </div>
          </div>
        </div>
        {active.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--green)", marginTop: 8 }}>
            Niciun acord suplimentar necesar.
          </p>
        )}
        {active.map((c) => (
          <div className="chk-row" key={c.field}>
            <div
              className={`chk-box${c.on ? " on" : c.req ? " miss" : ""}`}
              onClick={() => !busy && toggle(c.field, !c.on)}
            />
            <div className="chk-txt">
              <b>{c.label}</b>
              <small>{c.hint}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Step4Owners({
  tx,
  reload,
}: {
  tx: FlowTx;
  reload: () => Promise<void>;
}) {
  if (tx.owners.length === 0) {
    return (
      <div className="notice blue">
        <div className="notice-dot" />
        <div>
          <b>Niciun coproprietar determinat</b>
          <p>Lansați verificarea actelor la pasul 2–3 pentru a popula componența proprietarilor.</p>
        </div>
      </div>
    );
  }

  if (tx.dealType === "SCHIMB") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[1, 2].map((oi) => (
          <div key={oi}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: oi === 1 ? "var(--blue)" : "var(--purple)",
                marginBottom: 6,
              }}
            >
              Proprietari · Obiect {oi}
            </div>
            {tx.owners
              .filter((o) => o.objectIndex === oi)
              .map((o) => (
                <OwnerCard key={o.id} owner={o} txId={tx.id} reload={reload} />
              ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {tx.owners.map((o) => (
        <OwnerCard key={o.id} owner={o} txId={tx.id} reload={reload} />
      ))}
    </div>
  );
}
