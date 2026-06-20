import { useRef, useState } from "react";
import type { FlowTx } from "../types";

function DropZone({
  tx,
  objectIndex,
  reload,
  compact,
}: {
  tx: FlowTx;
  objectIndex: number;
  reload: () => Promise<void>;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs = tx.documents.filter((d) => d.objectIndex === objectIndex);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("objectIndex", String(objectIndex));
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      const r = await fetch(`/api/transactions/${tx.id}/documents`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error);
      await reload();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare la încărcare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`drop${over ? " over" : ""}`}
        style={compact ? { padding: "18px 14px" } : undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
      >
        <div style={{ fontSize: compact ? 18 : 22, color: "var(--ink4)", marginBottom: compact ? 5 : 7 }}>⬆</div>
        <div className="drop-big" style={compact ? { fontSize: 13 } : undefined}>
          {busy ? "Se încarcă…" : compact ? `Documente Obiect ${objectIndex}` : "Trageți fișierele aici"}
        </div>
        <div className="drop-sub">
          {compact ? "Act de drept · Extras · Contract" : (
            <>Contract · Extras din registru · Act de drept<br />PDF · JPG · PNG — până la 20 MB</>
          )}
        </div>
        <button className="drop-btn" type="button" style={compact ? { marginTop: 8 } : undefined}>
          + selectați fișiere
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          style={{ display: "none" }}
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {error && (
        <div className="notice red" style={{ marginTop: 8 }}>
          <div className="notice-dot" />
          <div>
            <b>{error}</b>
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {docs.map((d) => (
            <div className="doc-row" key={d.id}>
              <div className="doc-ic">{d.mimeType === "application/pdf" ? "PDF" : "IMG"}</div>
              <div>
                <div className="doc-name">{d.fileName}</div>
                <div className="doc-meta">Tip determinat automat</div>
              </div>
              <span className="badge b-green">det.</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Step2Upload({
  tx,
  reload,
  onAnalyzed,
}: {
  tx: FlowTx;
  reload: () => Promise<void>;
  onAnalyzed: () => void;
}) {
  const isSchimb = tx.dealType === "SCHIMB";
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDocs = tx.documents.length > 0;

  async function analyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const r = await fetch(`/api/transactions/${tx.id}/analyze`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error);
      await reload();
      onAnalyzed();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare la verificare.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <a href="https://programare.asp.gov.md/programare" target="_blank" rel="noopener noreferrer" className="btn solid" style={{ fontSize: 12 }}>
          🏛 Comandați Extras — ASP.gov.md ↗
        </a>
        <a href="https://map.ecadastre.md" target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: 12 }}>
          🗺 Date cadastrale — eCadastre.md ↗
        </a>
      </div>

      {isSchimb ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-hd" style={{ background: "var(--blue-bg)" }}>
              <b style={{ color: "var(--blue)" }}>Obiect 1</b>
            </div>
            <div className="card-bd">
              <DropZone tx={tx} objectIndex={1} reload={reload} compact />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-hd" style={{ background: "var(--purple-bg)" }}>
              <b style={{ color: "var(--purple)" }}>Obiect 2</b>
            </div>
            <div className="card-bd">
              <DropZone tx={tx} objectIndex={2} reload={reload} compact />
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-hd">
            <b>Fișiere</b>
          </div>
          <div className="card-bd">
            <DropZone tx={tx} objectIndex={1} reload={reload} />
          </div>
        </div>
      )}

      {error && (
        <div className="notice red" style={{ marginTop: 10 }}>
          <div className="notice-dot" />
          <div>
            <b>{error}</b>
          </div>
        </div>
      )}

      <button
        className="btn solid"
        style={{ marginTop: 14 }}
        onClick={analyze}
        disabled={!hasDocs || analyzing}
      >
        {analyzing ? "Se verifică actele… (Claude API)" : "Continuați → verificarea actelor"}
      </button>
      {!hasDocs && (
        <p style={{ fontSize: 12, color: "var(--ink3)", marginTop: 8 }}>
          Încărcați cel puțin un document pentru a continua.
        </p>
      )}
    </div>
  );
}
