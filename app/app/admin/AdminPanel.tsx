"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  plan: "BASIC" | "PRO";
  role: "AGENT" | "ADMIN";
  isBlocked: boolean;
  createdAt: string;
  transactionCount: number;
  analysisUsed: number;
};

type AdminTx = {
  id: string;
  address: string | null;
  dealType: string;
  status: "ACTIVE" | "WAITING" | "DONE" | "ARCHIVE";
  step: number;
  createdAt: string;
  agentId: string;
  agentLabel: string;
};

type Stats = {
  totalUsers: number;
  activeDeals: number;
  totalTransactions: number;
  claudeCalls: number;
  anuntCount: number;
  analysisCount: number;
  anuntCost: number;
  analysisCostEst: number;
  totalCost: number;
};

const STATUS_LABEL: Record<AdminTx["status"], string> = {
  ACTIVE: "În lucru",
  WAITING: "În așteptare",
  DONE: "Finisat",
  ARCHIVE: "Arhivă",
};
const STATUS_BADGE: Record<AdminTx["status"], string> = {
  ACTIVE: "b-green",
  WAITING: "b-amber",
  DONE: "b-blue",
  ARCHIVE: "b-gray",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function AdminPanel({
  currentUserId,
  users,
  transactions,
  stats,
}: {
  currentUserId: string;
  users: AdminUser[];
  transactions: AdminTx[];
  stats: Stats;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "tx" | "stats">("users");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Фильтры раздела «Транзакции»
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const agents = useMemo(() => {
    const m = new Map<string, string>();
    transactions.forEach((t) => m.set(t.agentId, t.agentLabel));
    return Array.from(m, ([id, label]) => ({ id, label }));
  }, [transactions]);

  const filteredTx = transactions.filter(
    (t) =>
      (!agentFilter || t.agentId === agentFilter) &&
      (!statusFilter || t.status === statusFilter),
  );

  async function patchUser(id: string, body: Record<string, unknown>) {
    setError(null);
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Eroare.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ig-page">
      <div className="crumb">Administrare</div>
      <h1>Panou de administrare</h1>
      <p className="sub">
        Gestionarea utilizatorilor, tranzacțiilor și monitorizarea costurilor Claude API.
      </p>

      {error && (
        <div className="notice red" style={{ marginBottom: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>{error}</b>
          </div>
        </div>
      )}

      <div className="obj-tabs">
        <button
          className={`obj-tab${tab === "users" ? " active" : ""}`}
          onClick={() => setTab("users")}
        >
          Utilizatori ({users.length})
        </button>
        <button
          className={`obj-tab${tab === "tx" ? " active" : ""}`}
          onClick={() => setTab("tx")}
        >
          Tranzacții ({transactions.length})
        </button>
        <button
          className={`obj-tab${tab === "stats" ? " active" : ""}`}
          onClick={() => setTab("stats")}
        >
          Statistică
        </button>
      </div>

      {/* ── 1. UTILIZATORI ── */}
      {tab === "users" && (
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nume</th>
                <th>Plan</th>
                <th>Înregistrat</th>
                <th className="num">Tranzacții</th>
                <th>Status</th>
                <th className="act">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const busy = busyId === u.id;
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id} className={u.isBlocked ? "blocked" : ""}>
                    <td>
                      {u.email}
                      {u.role === "ADMIN" && (
                        <span className="badge b-purple" style={{ marginLeft: 6 }}>
                          ADMIN
                        </span>
                      )}
                    </td>
                    <td>{u.name}</td>
                    <td>
                      <span className={`badge ${u.plan === "PRO" ? "b-blue" : "b-gray"}`}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="num">{u.transactionCount}</td>
                    <td>
                      {u.isBlocked ? (
                        <span className="badge b-red">Blocat</span>
                      ) : (
                        <span className="badge b-green">Activ</span>
                      )}
                    </td>
                    <td className="act">
                      <div className="adm-acts">
                        <button
                          className="btn"
                          disabled={busy}
                          onClick={() =>
                            patchUser(u.id, { plan: u.plan === "PRO" ? "BASIC" : "PRO" })
                          }
                        >
                          → {u.plan === "PRO" ? "BASIC" : "PRO"}
                        </button>
                        <button
                          className={`btn${u.isBlocked ? " solid" : ""}`}
                          disabled={busy || (isSelf && !u.isBlocked)}
                          title={
                            isSelf && !u.isBlocked
                              ? "Nu vă puteți bloca propriul cont"
                              : undefined
                          }
                          onClick={() => patchUser(u.id, { isBlocked: !u.isBlocked })}
                        >
                          {u.isBlocked ? "Deblocați" : "Blocați"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 2. TRANZACȚII ── */}
      {tab === "tx" && (
        <>
          <div className="filter-inputs" style={{ marginBottom: 14 }}>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">Toți agenții</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Toate statusurile</option>
              {(["ACTIVE", "WAITING", "DONE", "ARCHIVE"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "var(--ink3)" }}>
              {filteredTx.length} din {transactions.length}
            </span>
          </div>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Obiect</th>
                  <th>Tip</th>
                  <th className="num">Pas</th>
                  <th>Status</th>
                  <th>Creat</th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((t) => (
                  <tr key={t.id}>
                    <td>{t.agentLabel}</td>
                    <td>{t.address || "—"}</td>
                    <td className="nowrap">{t.dealType.replace(/_/g, " ").toLowerCase()}</td>
                    <td className="num">{t.step}/8</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="nowrap">{fmtDate(t.createdAt)}</td>
                  </tr>
                ))}
                {filteredTx.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--ink3)" }}>
                      Nicio tranzacție pentru filtrul selectat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 3. STATISTICĂ ── */}
      {tab === "stats" && (
        <>
          <div className="adm-stats">
            <div className="stat-box">
              <div className="stat-val">{stats.totalUsers}</div>
              <div className="stat-lbl">utilizatori</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{stats.activeDeals}</div>
              <div className="stat-lbl">tranzacții active</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{stats.claudeCalls}</div>
              <div className="stat-lbl">apeluri Claude (luna curentă)</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{fmtUsd(stats.totalCost)}</div>
              <div className="stat-lbl">cost estimat (luna curentă)</div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <b>Detalii apeluri Claude API — luna curentă</b>
            </div>
            <div className="card-bd">
              <table className="calc">
                <tbody>
                  <tr>
                    <td>Generări anunț (tokeni reali)</td>
                    <td className="r">{stats.anuntCount}</td>
                    <td className="r">{fmtUsd(stats.anuntCost)}</td>
                  </tr>
                  <tr>
                    <td>Analize documente (estimat)</td>
                    <td className="r">{stats.analysisCount}</td>
                    <td className="r">{fmtUsd(stats.analysisCostEst)}</td>
                  </tr>
                  <tr className="tot">
                    <td>Total</td>
                    <td className="r">{stats.claudeCalls}</td>
                    <td className="r">{fmtUsd(stats.totalCost)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 10, lineHeight: 1.6 }}>
                Costul generărilor de anunț se calculează din tokenii reali salvați
                (claude-sonnet-4-6, $3/$15 per 1M). Analizele de documente nu se loghează
                per-apel (doar contorul lunar), de aceea costul lor este o estimare.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
