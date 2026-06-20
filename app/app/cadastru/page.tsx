"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TraceStep = { s: "ok" | "run" | "wait"; title: string; val?: string; step?: string };
type CadRecord = {
  addr: string;
  supr: string;
  dest: string;
  val: string;
  prop: string;
  dr: string;
  not: string;
  int: string;
};
type Building = { bcad: string; addr: string; teren: string; apts: number[] };

const EXAMPLES = [
  { label: "adresă + apartament", q: "str. Cetatea Albă 143/1 ap.32" },
  { label: "adresă fără apartament", q: "str. Cetatea Albă 143/1" },
  { label: "număr cadastral", q: "0100110.477.05.040" },
];

function FlagBox({ k, v }: { k: string; v: string }) {
  const clear = v === "Nu există";
  return (
    <div className={`fl2-box ${clear ? "ok" : "bad"}`}>
      <div className="fl2-k">{k}</div>
      <div className="fl2-v">{(clear ? "✓ " : "! ") + v}</div>
    </div>
  );
}

function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ink3)",
          marginBottom: 7,
        }}
      >
        Acțiunile agentului
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((t, i) => (
          <li className="cad-tr-item" key={i}>
            {t.s === "ok" ? (
              <span className="cad-tk ok">✓</span>
            ) : t.s === "run" ? (
              <span className="cad-tk run">
                <span className="cad-spin" />
              </span>
            ) : (
              <span className="cad-tk wait">{t.step || "!"}</span>
            )}
            <span>
              <b>{t.title}</b>
              {t.val && (
                <>
                  <br />
                  <span className="cad-tr-val">{t.val}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CadastruPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [trace, setTrace] = useState<TraceStep[] | null>(null);
  const [record, setRecord] = useState<{ cadastralNo: string; record: CadRecord } | null>(null);
  const [picker, setPicker] = useState<{ building: Building; note: string } | null>(null);
  const [fallback, setFallback] = useState<{ title: string; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState<{ addr: string; cad: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function runLookup(rawQuery: string) {
    const raw = rawQuery.trim();
    if (!raw) return;
    setBusy(true);
    setRecord(null);
    setPicker(null);
    setFallback(null);
    setTrace([{ s: "run", title: "Recunosc datele introduse…" }]);

    let data: Record<string, unknown> | null = null;
    let ok = false;
    try {
      const r = await fetch("/api/cadastru/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: raw }),
      });
      ok = r.ok;
      data = await r.json();
    } catch {
      data = null;
    }

    await new Promise((res) => setTimeout(res, 450));
    setBusy(false);

    if (!data) {
      setTrace(null);
      setFallback({ title: "Eroare de rețea", text: "Încercați din nou sau deschideți portalul manual." });
      return;
    }
    if (!ok || data.status === "fallback") {
      setTrace(null);
      setFallback({ title: String(data.title ?? "Adresa nu a fost găsită."), text: String(data.text ?? "") });
      return;
    }
    if (data.status === "record") {
      setTrace((data.trace as TraceStep[]) ?? null);
      setRecord({ cadastralNo: String(data.cadastralNo), record: data.record as CadRecord });
      return;
    }
    if (data.status === "picker") {
      setTrace((data.trace as TraceStep[]) ?? null);
      setPicker({ building: data.building as Building, note: String(data.note) });
    }
  }

  function pickApt(b: Building, n: number) {
    setPicker(null);
    runLookup(`${b.bcad}.${String(n).padStart(3, "0")}`);
  }

  function createDossier() {
    if (!record) return;
    const addr = record.record.addr.replace(" (demo)", "");
    setConfirmed({ addr, cad: record.cadastralNo });
    const qs = new URLSearchParams({
      from: "cadastru",
      address: addr,
      cad: record.cadastralNo,
      objectType: "Apartament",
      supr: record.record.supr ?? "",
      dest: record.record.dest ?? "",
      val: record.record.val ?? "",
    });
    setTimeout(() => router.push(`/app/transactions/new?${qs.toString()}`), 600);
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", minHeight: "calc(100vh - 52px)" }}>
      <main style={{ padding: "80px 24px 60px", maxWidth: 760, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 14px" }}>Verificați un obiect în cadastru</h1>
          <p className="sub" style={{ fontSize: 16, maxWidth: 560, margin: "0 auto" }}>
            Căutați obiectul după adresă sau numărul cadastral înainte de a-l lua în lucru. Datele
            confirmate aici se transferă direct în Ghidul tranzacției.
          </p>
        </div>

        {/* ── Căutare ── */}
        <div className="card">
          <div className="card-bd" style={{ padding: "28px 26px 30px" }}>
            <div className="field-group">
              <label style={{ fontSize: 14 }}>Adresă sau număr cadastral</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="str. Independenței 42, ap. 7 sau 0100225.041.212"
                  style={{ flex: 1, height: 54, fontSize: 17, padding: "0 18px" }}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runLookup(query)}
                />
                <button
                  className="btn solid"
                  style={{ whiteSpace: "nowrap", height: 54, padding: "0 26px", fontSize: 15 }}
                  onClick={() => runLookup(query)}
                  disabled={busy}
                >
                  Căutați →
                </button>
              </div>
              <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--ink4)" }}>Exemple:</span>
                {EXAMPLES.map((ex) => (
                  <span
                    key={ex.q}
                    className="law-tag"
                    style={{ cursor: "pointer", fontSize: 13, padding: "6px 11px" }}
                    onClick={() => setQuery(ex.q)}
                  >
                    {ex.label}
                  </span>
                ))}
              </div>
            </div>

            {trace && <Trace steps={trace} />}

            {picker && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 8 }}>{picker.note}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {picker.building.apts.map((n) => (
                    <span key={n} className="cad-apt-chip" onClick={() => pickApt(picker.building, n)}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {fallback && (
              <div className="notice red" style={{ marginTop: 16 }}>
                <div className="notice-dot" />
                <div>
                  <b>{fallback.title}</b>
                  <p style={{ margin: "4px 0 8px" }}>{fallback.text}</p>
                  <a className="btn" href="https://www.cadastru.md/ecadastru" target="_blank" rel="noopener noreferrer">
                    Deschideți e-Cadastru manual →
                  </a>
                </div>
              </div>
            )}

            {record && (
              <div style={{ marginTop: 18 }}>
                <table className="ftbl">
                  <tbody>
                    <tr><td className="k">Adresă</td><td className="v">{record.record.addr}</td></tr>
                    <tr><td className="k">Număr cadastral</td><td className="v">{record.cadastralNo}</td></tr>
                    <tr><td className="k">Suprafață</td><td className="v">{record.record.supr}</td></tr>
                    <tr><td className="k">Destinație</td><td className="v">{record.record.dest}</td></tr>
                    <tr><td className="k">Valoare (evaluare)</td><td className="v">{record.record.val}</td></tr>
                    <tr><td className="k">Tip proprietate</td><td className="v">{record.record.prop}</td></tr>
                  </tbody>
                </table>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                  <FlagBox k="Alte drepturi reale" v={record.record.dr} />
                  <FlagBox k="Notări" v={record.record.not} />
                  <FlagBox k="Interdicții" v={record.record.int} />
                </div>
                <div className="note note-warn" style={{ marginTop: 10 }}>
                  Date orientative din Registrul bunurilor imobile. Persoanele cu date personale nu
                  sunt afișate la acest pas (Legea 133/2011).
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <a className="btn" href="https://www.cadastru.md/ecadastru" target="_blank" rel="noopener noreferrer">
                    Deschideți e-Cadastru ↗
                  </a>
                  <button className="btn solid" onClick={createDossier}>
                    Creați dosarul ↓
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Подтверждение → редирект */}
        {confirmed && (
          <div className="notice green" style={{ marginTop: 14 }}>
            <div className="notice-dot" />
            <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <b>{confirmed.addr}</b>
                <p style={{ margin: "2px 0 0", fontSize: 11.5 }}>
                  Număr cadastral {confirmed.cad} · confirmat → se deschide Ghidul tranzacției…
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Legendă semnale — горизонтально, без рамки */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
            marginTop: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
            Nu există — fără obstacole
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
            Există — necesită clarificare
          </div>
        </div>
      </main>
    </div>
  );
}
