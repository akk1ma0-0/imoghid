"use client";

import { useMemo, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import type { FlowTx } from "./types";
import {
  buildInitialReport,
  buildReportDocx,
  emptyFieldCount,
  type ReportData,
} from "./report";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Поле: серый фон = автозаполнено, синяя рамка = пусто (требует заполнения).
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const empty = !value || !value.trim();
  return (
    <div className="field-group">
      <label>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={
          empty
            ? { borderColor: "var(--blue)", boxShadow: "0 0 0 1px var(--blue-br)" }
            : { background: "var(--line2)" }
        }
      />
    </div>
  );
}

function cellStyle(value: string): React.CSSProperties {
  const empty = !value || !value.trim();
  return {
    width: "100%",
    fontSize: 13,
    padding: "6px 8px",
    border: "1px solid var(--line)",
    borderRadius: "var(--r)",
    ...(empty
      ? { borderColor: "var(--blue)" }
      : { background: "var(--line2)" }),
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="modal-section">{title}</div>
      {children}
    </div>
  );
}

export function ReportModal({
  tx,
  agentName,
  savedContent,
  onClose,
  onSaved,
}: {
  tx: FlowTx;
  agentName: string;
  savedContent: ReportData | null;
  onClose: () => void;
  onSaved: (content: ReportData, docxUrl: string | null) => void;
}) {
  const [report, setReport] = useState<ReportData>(
    () => savedContent ?? buildInitialReport(tx, agentName),
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const emptyCount = useMemo(() => emptyFieldCount(report), [report]);

  const setGeneral = (k: keyof ReportData["general"], v: string) =>
    setReport((r) => ({ ...r, general: { ...r.general, [k]: v } }));
  const setObiect = (k: keyof ReportData["obiect"], v: string) =>
    setReport((r) => ({ ...r, obiect: { ...r.obiect, [k]: v } }));
  const setCalcule = (k: keyof ReportData["calcule"], v: string) =>
    setReport((r) => ({ ...r, calcule: { ...r.calcule, [k]: v } }));
  const setSemnal = (k: keyof ReportData["semnale"], v: string) =>
    setReport((r) => ({ ...r, semnale: { ...r.semnale, [k]: v } }));

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  async function save() {
    setBusy(true);
    try {
      const blob = await buildReportDocx(report);
      const addr = (report.general.adresa || "obiect")
        .replace(/[^\p{L}\p{N}]+/gu, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "obiect";
      const date = (report.general.dataRaport || "").replace(/\D+/g, "-");
      const filename = `Fisa_Obiectului_${addr}_${date}.docx`;

      // 1) Скачивание на устройство.
      downloadBlob(blob, filename);

      // 2) Загрузка в Vercel Blob (best-effort).
      let docxUrl: string | null = null;
      try {
        const up = await blobUpload(filename, blob, {
          access: "public",
          contentType: DOCX_MIME,
          handleUploadUrl: `/api/transactions/${tx.id}/report/blob`,
        });
        docxUrl = up.url;
      } catch {
        docxUrl = null;
      }

      // 3) Сохранение в БД (upsert).
      const r = await fetch(`/api/transactions/${tx.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: report, docxUrl }),
      });
      if (!r.ok) throw new Error();
      showToast("Fișa salvată și descărcată ✓");
      onSaved(report, docxUrl);
    } catch {
      showToast("Eroare la salvare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width: "92vw", maxWidth: 1000 }}>
        <div className="modal-hd">
          <h2>Fișa obiectului{report.general.adresa ? ` — ${report.general.adresa}` : ""}</h2>
          <button className="btn" style={{ padding: "4px 10px" }} onClick={onClose}>✕</button>
        </div>

        <div className="modal-bd">
          {emptyCount > 0 && (
            <div className="notice blue" style={{ marginBottom: 14 }}>
              <div className="notice-dot" />
              <div><b>{emptyCount} câmpuri necesită completare</b> (marcate cu chenar albastru).</div>
            </div>
          )}

          <Section title="1. Date generale">
            <div className="field-row">
              <Field label="Tip tranzacție" value={report.general.tipTranzactie} onChange={(v) => setGeneral("tipTranzactie", v)} />
              <Field label="Data raportului" value={report.general.dataRaport} onChange={(v) => setGeneral("dataRaport", v)} />
            </div>
            <Field label="Obiect (adresă)" value={report.general.adresa} onChange={(v) => setGeneral("adresa", v)} />
            <div className="field-row">
              <Field label="Număr cadastral" value={report.general.cadastral} onChange={(v) => setGeneral("cadastral", v)} />
              <Field label="Agent" value={report.general.agent} onChange={(v) => setGeneral("agent", v)} />
            </div>
            <div className="field-row">
              <Field label="Vânzător" value={report.general.vanzator} onChange={(v) => setGeneral("vanzator", v)} />
              <Field label="Cumpărător" value={report.general.cumparator} onChange={(v) => setGeneral("cumparator", v)} />
            </div>
          </Section>

          <Section title="2. Concluzie">
            <textarea
              rows={2}
              value={report.concluzie}
              onChange={(e) => setReport((r) => ({ ...r, concluzie: e.target.value }))}
              style={{ width: "100%", background: report.concluzie.trim() ? "var(--line2)" : undefined }}
            />
          </Section>

          <Section title="3. Obiectul tranzacției">
            <div className="field-row-3">
              <Field label="Suprafață" value={report.obiect.suprafata} onChange={(v) => setObiect("suprafata", v)} />
              <Field label="Destinație" value={report.obiect.destinatie} onChange={(v) => setObiect("destinatie", v)} />
              <Field label="Valoare estimată" value={report.obiect.valoare} onChange={(v) => setObiect("valoare", v)} />
            </div>
            <div className="field-row-3">
              <Field label="Alte drepturi reale" value={report.obiect.alteDrepturi} onChange={(v) => setObiect("alteDrepturi", v)} />
              <Field label="Notări" value={report.obiect.notari} onChange={(v) => setObiect("notari", v)} />
              <Field label="Interdicții" value={report.obiect.interdictii} onChange={(v) => setObiect("interdictii", v)} />
            </div>
          </Section>

          <Section title="4. Părțile">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1.2fr auto", gap: 6, alignItems: "center" }}>
              <div className="doc-meta">Rol</div>
              <div className="doc-meta">Nume</div>
              <div className="doc-meta">IDNP</div>
              <div />
              {report.parti.map((p, i) => (
                <RowFrag key={i}>
                  <input style={cellStyle(p.rol)} value={p.rol} onChange={(e) => setReport((r) => ({ ...r, parti: r.parti.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)) }))} />
                  <input style={cellStyle(p.nume)} value={p.nume} onChange={(e) => setReport((r) => ({ ...r, parti: r.parti.map((x, j) => (j === i ? { ...x, nume: e.target.value } : x)) }))} />
                  <input style={cellStyle(p.idnp)} value={p.idnp} onChange={(e) => setReport((r) => ({ ...r, parti: r.parti.map((x, j) => (j === i ? { ...x, idnp: e.target.value } : x)) }))} />
                  <button className="doc-del" title="Șterge" onClick={() => setReport((r) => ({ ...r, parti: r.parti.filter((_, j) => j !== i) }))}>×</button>
                </RowFrag>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setReport((r) => ({ ...r, parti: [...r.parti, { rol: "", nume: "", idnp: "" }] }))}>+ Adaugă parte</button>
          </Section>

          <Section title="5. Rezultatele verificării">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6, alignItems: "center" }}>
              <div className="doc-meta">Aspect</div>
              <div className="doc-meta">Rezultat</div>
              {report.verificare.length === 0 && <div className="doc-meta" style={{ gridColumn: "1 / -1" }}>Nu există rezultate (lansați verificarea la pasul 3).</div>}
              {report.verificare.map((v, i) => (
                <RowFrag key={i}>
                  <input style={cellStyle(v.aspect)} value={v.aspect} onChange={(e) => setReport((r) => ({ ...r, verificare: r.verificare.map((x, j) => (j === i ? { ...x, aspect: e.target.value } : x)) }))} />
                  <input style={cellStyle(v.rezultat)} value={v.rezultat} onChange={(e) => setReport((r) => ({ ...r, verificare: r.verificare.map((x, j) => (j === i ? { ...x, rezultat: e.target.value } : x)) }))} />
                </RowFrag>
              ))}
            </div>
          </Section>

          <Section title="6. Semnale și riscuri">
            <label className="field-group" style={{ display: "block" }}>
              <span style={{ fontSize: 11, color: "var(--red)" }}>STOP (blocaje) — câte unul pe rând</span>
              <textarea rows={2} value={report.semnale.stop} onChange={(e) => setSemnal("stop", e.target.value)} style={{ width: "100%" }} />
            </label>
            <label className="field-group" style={{ display: "block" }}>
              <span style={{ fontSize: 11, color: "var(--amber)" }}>Atenție</span>
              <textarea rows={2} value={report.semnale.atentie} onChange={(e) => setSemnal("atentie", e.target.value)} style={{ width: "100%" }} />
            </label>
            <label className="field-group" style={{ display: "block" }}>
              <span style={{ fontSize: 11, color: "var(--green)" }}>Info</span>
              <textarea rows={2} value={report.semnale.info} onChange={(e) => setSemnal("info", e.target.value)} style={{ width: "100%" }} />
            </label>
          </Section>

          <Section title="7. Completitudinea pachetului">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 6, alignItems: "center" }}>
              <div className="doc-meta">Document</div>
              <div className="doc-meta">Status</div>
              <div />
              {report.pachet.map((p, i) => (
                <RowFrag key={i}>
                  <input style={cellStyle(p.document)} value={p.document} onChange={(e) => setReport((r) => ({ ...r, pachet: r.pachet.map((x, j) => (j === i ? { ...x, document: e.target.value } : x)) }))} />
                  <input style={cellStyle(p.status)} value={p.status} onChange={(e) => setReport((r) => ({ ...r, pachet: r.pachet.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)) }))} />
                  <button className="doc-del" title="Șterge" onClick={() => setReport((r) => ({ ...r, pachet: r.pachet.filter((_, j) => j !== i) }))}>×</button>
                </RowFrag>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setReport((r) => ({ ...r, pachet: [...r.pachet, { document: "", status: "lipsește" }] }))}>+ Adaugă document</button>
          </Section>

          <Section title="8. Calcule">
            <div className="field-row">
              <Field label="Preț" value={report.calcule.pret} onChange={(v) => setCalcule("pret", v)} />
              <Field label="Impozit" value={report.calcule.impozit} onChange={(v) => setCalcule("impozit", v)} />
            </div>
            <div className="field-row">
              <Field label="Cheltuieli notariale" value={report.calcule.notar} onChange={(v) => setCalcule("notar", v)} />
              <Field label="Alte cheltuieli" value={report.calcule.altele} onChange={(v) => setCalcule("altele", v)} />
            </div>
          </Section>

          <Section title="9–10. Pași următori și dosar notar">
            <label className="field-group" style={{ display: "block" }}>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>Pași următori — câte unul pe rând</span>
              <textarea rows={3} value={report.pasi} onChange={(e) => setReport((r) => ({ ...r, pasi: e.target.value }))} style={{ width: "100%" }} />
            </label>
            <label className="field-group" style={{ display: "block" }}>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>Dosar pentru notar</span>
              <textarea rows={3} value={report.dosarNotar} onChange={(e) => setReport((r) => ({ ...r, dosarNotar: e.target.value }))} style={{ width: "100%" }} />
            </label>
          </Section>

          <Section title="11. Temei legal">
            <textarea rows={3} value={report.temeiLegal} onChange={(e) => setReport((r) => ({ ...r, temeiLegal: e.target.value }))} style={{ width: "100%", background: report.temeiLegal.trim() ? "var(--line2)" : undefined }} />
          </Section>
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onClose} disabled={busy}>Anulați</button>
          <button className="btn solid" onClick={save} disabled={busy}>
            {busy ? "Se salvează…" : "Salvați"}
          </button>
        </div>

        {toast && (
          <div
            style={{
              position: "absolute",
              bottom: 70,
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--ink, #1c2630)",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              zIndex: 20,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

// React.Fragment-обёртка для строк grid (ключ обязателен у вызывающего).
function RowFrag({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
