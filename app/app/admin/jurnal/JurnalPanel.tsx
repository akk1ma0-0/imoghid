"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "login" | "cadastru" | "consum" | "admin";
const TABS: { key: Tab; label: string }[] = [
  { key: "login", label: "Intrări" },
  { key: "cadastru", label: "Verificări cadastrale" },
  { key: "consum", label: "Consum" },
  { key: "admin", label: "Acțiuni admin" },
];
const FEATURE_LABEL: Record<string, string> = {
  CADASTRU_CHECK: "Verificări cadastrale",
  DOSAR_ANALYSIS: "Analize dosar",
  CREATOR_HUB: "Creator Hub",
  ANUNT_999: "Anunțuri 999",
  OBIECTE_CREATE: "Creare dosar (acces unic)",
};
const FEATURES = Object.keys(FEATURE_LABEL);

type Resp = {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total?: number;
  rows?: Record<string, string | number>[];
  byDay?: { day: string; counts: Record<string, number>; total: number }[];
  byUser?: { user: string; name: string; counts: Record<string, number>; total: number }[];
  error?: string;
};

const COLS: Record<Exclude<Tab, "consum">, { key: string; label: string }[]> = {
  login: [
    { key: "at", label: "Data și ora" },
    { key: "user", label: "Utilizator" },
    { key: "name", label: "Nume" },
    { key: "result", label: "Rezultat" },
  ],
  cadastru: [
    { key: "at", label: "Data și ora" },
    { key: "user", label: "Utilizator" },
    { key: "cadastralNo", label: "Număr cadastral" },
    { key: "result", label: "Rezultat" },
    { key: "attempts", label: "Încercări" },
    { key: "ms", label: "ms" },
    { key: "requestId", label: "ID cerere" },
  ],
  admin: [
    { key: "at", label: "Data și ora" },
    { key: "type", label: "Tip" },
    { key: "action", label: "Acțiune" },
    { key: "actor", label: "Efectuat de" },
    { key: "subject", label: "Utilizator vizat" },
    { key: "details", label: "Detalii" },
  ],
};

export function JurnalPanel({ role }: { role: "ADMIN" | "AUDITOR" }) {
  const [tab, setTab] = useState<Tab>("login");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams({ type: tab, ...extra });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (q.trim()) p.set("q", q.trim());
      return p.toString();
    },
    [tab, from, to, q],
  );

  const load = useCallback(
    async (pg: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/jurnal?${qs({ page: String(pg) })}`, { cache: "no-store" });
        const j = (await res.json()) as Resp;
        if (!res.ok) throw new Error(j.error || "Eroare la încărcare.");
        setData(j);
        // Подставляем фактический период (по умолчанию — последние 7 дней).
        if (!from) setFrom(j.from);
        if (!to) setTo(j.to);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Eroare.");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qs],
  );

  // Смена вкладки / страницы → перезагрузка. Фильтры применяются кнопкой «Aplică».
  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const totalPages = data?.total != null ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="ig-page">
      <div className="crumb">{role === "ADMIN" ? "Administrare" : "Audit"}</div>
      <h1>Jurnal</h1>
      <p className="sub">
        Intrări, verificări cadastrale, consum pe zile și funcții, acțiuni ale administratorilor. Doar citire; orele sunt
        în fusul Chișinău.
      </p>

      <div className="obj-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`obj-tab${tab === t.key ? " active" : ""}`}
            onClick={() => {
              setPage(1);
              setTab(t.key);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (page === 1) load(1);
          else setPage(1);
        }}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}
      >
        <div className="field-group" style={{ margin: 0 }}>
          <label>De la</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field-group" style={{ margin: 0 }}>
          <label>Până la</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field-group" style={{ margin: 0, minWidth: 220 }}>
          <label>Utilizator (e-mail)</label>
          <input type="text" value={q} placeholder="parte din e-mail" onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn solid" type="submit" disabled={loading}>
          Aplică
        </button>
        <a className="btn" href={`/api/admin/jurnal/export?${qs()}`} download>
          Descarcă Excel
        </a>
      </form>

      {error && (
        <div className="notice red" style={{ marginBottom: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>{error}</b>
          </div>
        </div>
      )}
      {loading && <p className="sub">Se încarcă…</p>}

      {data && tab !== "consum" && (
        <>
          <p className="sub">
            {data.from} — {data.to} · {data.total ?? 0} înregistrări
          </p>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  {COLS[tab].map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.rows ?? []).map((r, i) => (
                  <tr key={i}>
                    {COLS[tab].map((c) => (
                      <td key={c.key}>{String(r[c.key] ?? "")}</td>
                    ))}
                  </tr>
                ))}
                {!data.rows?.length && (
                  <tr>
                    <td colSpan={COLS[tab].length} style={{ color: "var(--ink3)" }}>
                      Nicio înregistrare în perioada aleasă.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
              <button className="btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                ← Anterior
              </button>
              <span className="sub" style={{ margin: 0 }}>
                Pagina {page} din {totalPages}
              </span>
              <button className="btn" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>
                Următoarea →
              </button>
            </div>
          )}
        </>
      )}

      {data && tab === "consum" && (
        <>
          <h3 style={{ margin: "14px 0 8px" }}>Pe zile</h3>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Ziua</th>
                  {FEATURES.map((f) => (
                    <th key={f}>{FEATURE_LABEL[f]}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.byDay ?? []).map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    {FEATURES.map((f) => (
                      <td key={f}>{d.counts[f] ?? 0}</td>
                    ))}
                    <td>
                      <b>{d.total}</b>
                    </td>
                  </tr>
                ))}
                {!data.byDay?.length && (
                  <tr>
                    <td colSpan={FEATURES.length + 2} style={{ color: "var(--ink3)" }}>
                      Niciun consum în perioada aleasă.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h3 style={{ margin: "18px 0 8px" }}>Pe utilizatori</h3>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Utilizator</th>
                  <th>Nume</th>
                  {FEATURES.map((f) => (
                    <th key={f}>{FEATURE_LABEL[f]}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.byUser ?? []).map((u, i) => (
                  <tr key={i}>
                    <td>{u.user}</td>
                    <td>{u.name}</td>
                    {FEATURES.map((f) => (
                      <td key={f}>{u.counts[f] ?? 0}</td>
                    ))}
                    <td>
                      <b>{u.total}</b>
                    </td>
                  </tr>
                ))}
                {!data.byUser?.length && (
                  <tr>
                    <td colSpan={FEATURES.length + 3} style={{ color: "var(--ink3)" }}>
                      Niciun consum în perioada aleasă.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
