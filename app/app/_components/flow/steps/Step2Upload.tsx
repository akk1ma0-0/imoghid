"use client";

import { useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import type { FlowTx } from "../types";

// Безопасно извлекает сообщение об ошибке загрузки. При превышении лимита тела
// сервер/прокси может вернуть HTML/текст («Request Entity Too Large»), а не JSON —
// тогда JSON.parse падает. Здесь это перехватывается и даётся понятное сообщение.
async function readUploadError(r: Response, fileName: string): Promise<string> {
  if (r.status === 413) {
    return `Fișierul „${fileName}” este prea mare pentru încărcare. Comprimați documentul (max 15 MB) și încercați din nou.`;
  }
  try {
    const d = (await r.json()) as { error?: string };
    return d?.error || "Eroare la încărcare.";
  } catch {
    return `Nu s-a putut încărca „${fileName}”. Fișierul poate fi prea mare — comprimați-l și încercați din nou.`;
  }
}

function DropZone({
  tx,
  objectIndex,
  reload,
  compact,
  skippable,
}: {
  tx: FlowTx;
  objectIndex: number;
  reload: () => Promise<void>;
  compact?: boolean;
  skippable?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs = tx.documents.filter((d) => d.objectIndex === objectIndex);
  // Pentru Schimb, „Nu sunt la moment" e bifat implicit (dacă nu sunt documente încărcate).
  const [skip, setSkip] = useState(skippable ? docs.length === 0 : false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function deleteDoc(docId: string) {
    setDeleting(docId);
    try {
      await fetch(`/api/transactions/${tx.id}/documents/${docId}`, { method: "DELETE" });
      await reload();
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  async function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList);

    // Валидация на клиенте: каждый файл ≤ 15 МБ (иначе упрёмся в лимит тела запроса).
    const MAX_CLIENT = 15 * 1024 * 1024;
    if (files.some((f) => f.size > MAX_CLIENT)) {
      setError("Fișierul depășește limita de 15 MB. Comprimați documentul și încercați din nou.");
      return;
    }

    setBusy(true);
    try {
      for (const f of files) {
        // 1) Файл идёт НАПРЯМУЮ в Vercel Blob из браузера — минуя 4.5 МБ-лимит
        //    тела serverless-функции и read-only ФС на проде.
        const blob = await blobUpload(f.name, f, {
          access: "public",
          contentType: f.type,
          handleUploadUrl: `/api/transactions/${tx.id}/documents/blob`,
        });
        // 2) Регистрируем документ в БД — только метадата (крошечный JSON).
        const r = await fetch(`/api/transactions/${tx.id}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: blob.url,
            fileName: f.name,
            fileSize: f.size,
            mimeType: f.type,
            objectIndex,
          }),
        });
        if (!r.ok) throw new Error(await readUploadError(r, f.name));
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare la încărcare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {skippable && (
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "var(--ink2)", cursor: "pointer" }}
        >
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} style={{ width: "auto" }} />
          Nu sunt la moment
        </label>
      )}

      {skip ? (
        <div style={{ fontSize: 12, color: "var(--ink3)", lineHeight: 1.5 }}>
          Documentele vor fi adăugate ulterior. Debifați „Nu sunt la moment” pentru a le încărca acum.
        </div>
      ) : (
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
      )}

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
              <div style={{ minWidth: 0 }}>
                <div className="doc-name">{d.fileName}</div>
                <div className="doc-meta">Tip determinat automat</div>
              </div>
              <span className="badge b-green">det.</span>
              <button
                type="button"
                className="doc-del"
                title="Șterge documentul"
                disabled={deleting === d.id}
                onClick={() => deleteDoc(d.id)}
              >
                ×
              </button>
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
              <DropZone tx={tx} objectIndex={1} reload={reload} compact skippable />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-hd" style={{ background: "var(--purple-bg)" }}>
              <b style={{ color: "var(--purple)" }}>Obiect 2</b>
            </div>
            <div className="card-bd">
              <DropZone tx={tx} objectIndex={2} reload={reload} compact skippable />
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
        {analyzing ? "Se verifică actele…" : "Continuați → verificarea actelor"}
      </button>
      {!hasDocs && (
        <p style={{ fontSize: 12, color: "var(--ink3)", marginTop: 8 }}>
          Încărcați cel puțin un document pentru a continua.
        </p>
      )}
    </div>
  );
}
