"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = "active" | "waiting" | "done" | "archive";

type TxCard = {
  id: string;
  address: string | null;
  objectType: string | null;
  clientName: string | null;
  clientContractRef: string | null;
  dealType: string;
  currentStep: number;
  totalSteps: number;
  price: number | null;
  status: Status;
  createdAt: string;
};

const STATUS_META: Record<Status, { dot: string; cls: string; label: string }> = {
  active: { dot: "var(--green)", cls: "b-green", label: "Activ" },
  waiting: { dot: "var(--amber)", cls: "b-amber", label: "În așteptare" },
  done: { dot: "var(--blue)", cls: "b-blue", label: "Finisat" },
  archive: { dot: "var(--ink3)", cls: "b-gray", label: "Arhivă" },
};

const TABS: { key: Status; label: string }[] = [
  { key: "active", label: "În lucru" },
  { key: "waiting", label: "În așteptare" },
  { key: "done", label: "Finisate" },
  { key: "archive", label: "Arhivă" },
];

// Кнопки смены статуса на карточке (показываются все, кроме текущего статуса).
const STATUS_TARGETS: { key: Status; label: string }[] = [
  { key: "active", label: "Reactivează" },
  { key: "waiting", label: "În așteptare" },
  { key: "done", label: "Finisează" },
  { key: "archive", label: "În arhivă" },
];

function fmtPrice(price: number | null): string {
  if (price === null) return "—";
  return `${Math.round(price).toLocaleString("ro-MD")} MDL`;
}

export default function ObjectsPage() {
  const [txs, setTxs] = useState<TxCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status>("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/transactions")
      .then((r) => r.json())
      .then((d) => setTxs(d.transactions ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Sigur doriți să ștergeți acest obiect? Toate documentele și datele vor fi șterse permanent.",
      )
    )
      return;
    setBusyId(id);
    const prev = txs;
    setTxs((list) => list.filter((t) => t.id !== id)); // optimistic
    try {
      const r = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } catch {
      setTxs(prev);
      alert("Eroare la ștergerea obiectului.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetStatus(id: string, status: Status) {
    setBusyId(id);
    const prev = txs;
    setTxs((list) => list.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    try {
      const r = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setTxs(prev);
      alert("Eroare la schimbarea statusului.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = TABS.reduce(
    (acc, t) => ({ ...acc, [t.key]: txs.filter((x) => x.status === t.key).length }),
    {} as Record<Status, number>,
  );
  const shown = txs.filter((t) => t.status === tab);

  return (
    <div className="ig-page">
      <div className="crumb">Modul</div>
      <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 14 }}>
        Obiectele mele
      </h1>

      <div className="obj-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`obj-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </div>

      <div className="obj-grid">
        {shown.map((t) => {
          const b = STATUS_META[t.status];
          return (
            <div className="obj-card" key={t.id}>
              <button
                className="obj-del"
                title="Ștergeți obiectul"
                aria-label="Ștergeți obiectul"
                disabled={busyId === t.id}
                onClick={() => handleDelete(t.id)}
              >
                ✕
              </button>
              <div className="obj-card-hd" style={{ paddingRight: 30 }}>
                <div className="obj-status" style={{ background: b.dot }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t.address || "Obiect fără adresă"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)" }}>{t.objectType || "—"}</div>
                </div>
                <span className={`badge ${b.cls}`} style={{ marginLeft: "auto" }}>
                  {b.label}
                </span>
              </div>
              <div className="obj-card-bd">
                <div className="obj-meta-row">
                  <span>Client</span>
                  <b>{t.clientName || "—"}</b>
                </div>
                <div className="obj-meta-row">
                  <span>Preț</span>
                  <b>{fmtPrice(t.price)}</b>
                </div>
                <div className="obj-meta-row">
                  <span>Ghidul tranzacției</span>
                  <b>
                    Pasul {t.currentStep} / {t.totalSteps}
                  </b>
                </div>
                <div className="obj-meta-row">
                  <span>Contract cu clientul</span>
                  <b>{t.clientContractRef || "neîncheiat"}</b>
                </div>
              </div>
              <div className="obj-card-ft">
                <Link
                  className="btn solid"
                  href={`/app/transactions/${t.id}?step=${t.currentStep}`}
                >
                  Deschide ghidul
                </Link>
              </div>
              <div className="obj-card-ft" style={{ borderTop: "1px dashed var(--line)" }}>
                {STATUS_TARGETS.filter((s) => s.key !== t.status).map((s) => (
                  <button
                    key={s.key}
                    className="btn"
                    disabled={busyId === t.id}
                    onClick={() => handleSetStatus(t.id, s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Adăugați obiect */}
        <Link
          href="/app/transactions/new"
          className="obj-card"
          style={{ border: "2px dashed var(--line)", cursor: "pointer", textDecoration: "none" }}
        >
          <div style={{ padding: 30, textAlign: "center", color: "var(--ink3)" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink2)" }}>
              Adăugați obiect
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Creați un nou ghid de tranzacție</div>
          </div>
        </Link>
      </div>

      {loading && (
        <p style={{ color: "var(--ink3)", fontSize: 13, marginTop: 16 }}>Se încarcă…</p>
      )}
    </div>
  );
}
