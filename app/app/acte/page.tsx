"use client";

import { useEffect, useRef, useState } from "react";
import { numToRoWords } from "@/lib/ro-words";
import { ACTE_TEMPLATES_META } from "@/lib/acte-templates-meta";

type TxOpt = { id: string; address: string | null; clientName: string | null };

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "tel" | "email" | "select";
  options?: string[];
  ph?: string;
};
type Row = { fields: Field[]; hint?: (f: Record<string, string>) => string };
type Section = { title: string; rows: Row[] };

const GARANTIE: Section[] = [
  {
    title: "Agent / Reprezentant vânzător",
    rows: [
      { fields: [{ key: "agent_nume", label: "Numele și prenumele agentului", ph: "Nume Prenume" }] },
      { fields: [
        { key: "agent_buletin_seria", label: "Buletin seria", ph: "A" },
        { key: "agent_buletin_nr", label: "Buletin nr.", ph: "123456" },
      ] },
      { fields: [{ key: "agent_domiciliu", label: "Domiciliu agent", ph: "Localitate, stradă, nr." }] },
      { fields: [{ key: "contract_intermediere_nr", label: "Contractul de intermediere nr.", ph: "42" }] },
      { fields: [{ key: "contract_intermediere_data", label: "Data contractului de intermediere", type: "date" }] },
    ],
  },
  {
    title: "Vânzător (proprietar)",
    rows: [{ fields: [{ key: "vanzator_nume", label: "Numele și prenumele vânzătorului", ph: "Nume Prenume" }] }],
  },
  {
    title: "Cumpărător",
    rows: [
      { fields: [{ key: "cumparator_nume", label: "Numele și prenumele cumpărătorului", ph: "Ionescu Alexandru" }] },
      { fields: [
        { key: "cumparator_buletin_seria", label: "Buletin seria", ph: "A" },
        { key: "cumparator_buletin_nr", label: "Buletin nr.", ph: "654321" },
      ] },
      { fields: [{ key: "cumparator_domiciliu", label: "Domiciliu cumpărător", ph: "str. Decebal 5, Chișinău" }] },
    ],
  },
  {
    title: "Imobil",
    rows: [
      { fields: [{ key: "numar_cadastral", label: "Număr cadastral", ph: "0100225.041.0212" }] },
      { fields: [{ key: "imobil_adresa", label: "Adresa imobilului", ph: "Localitate, stradă, nr., ap." }] },
      { fields: [{ key: "imobil_descriere", label: "Descriere scurtă imobil (tip, sector)", ph: "apartament cu 2 camere, sect. Botanica" }] },
    ],
  },
  {
    title: "Suma garanției și prețul estimat",
    rows: [
      {
        fields: [
          { key: "suma_garantie_cifre", label: "Suma garanției (cifre)", type: "number", ph: "5000" },
          { key: "suma_valuta", label: "Valuta", type: "select", options: ["lei", "euro"] },
        ],
        hint: (f) =>
          f.suma_garantie_cifre ? `→ ${numToRoWords(f.suma_garantie_cifre)} ${f.suma_valuta || "lei"}` : "",
      },
      { fields: [
        { key: "pret_estimat", label: "Prețul estimat (cifre)", type: "number", ph: "72000" },
        { key: "valuta_pret_estimat", label: "Valuta preț estimat", type: "select", options: ["lei", "euro"] },
      ] },
      { fields: [{ key: "termen_rezervare", label: "Termen rezervare (data)", type: "date" }] },
    ],
  },
  {
    title: "Semnături",
    rows: [
      { fields: [{ key: "vanzator_semnatura_nume", label: "Vânzător / reprezentant (nume pentru semnătură)", ph: "Nume Prenume" }] },
      { fields: [{ key: "cumparator_semnatura_nume", label: "Cumpărător (nume pentru semnătură)", ph: "Ionescu Alexandru" }] },
      { fields: [{ key: "martori_nume", label: "Martori (nume, opțional)", ph: "Popa Ion, Ciobanu Ana" }] },
      { fields: [{ key: "data_intocmirii", label: "Data întocmirii", type: "date" }] },
    ],
  },
];

const CONTRACT: Section[] = [
  {
    title: "Date contract",
    rows: [
      { fields: [
        { key: "contract_nr", label: "Nr. contract", ph: "42" },
        { key: "contract_data", label: "Data semnării", type: "date" },
        { key: "contract_localitate", label: "Localitate", ph: "Chișinău" },
      ] },
    ],
  },
  {
    title: "Prestator (agent / agenție)",
    rows: [
      { fields: [{ key: "prestator_nume", label: "Denumirea agenției / Numele agentului", ph: "Denumirea sau numele" }] },
      { fields: [{ key: "prestator_adresa", label: "Sediu / Adresă", ph: "Localitate, stradă, nr." }] },
      { fields: [{ key: "prestator_idno", label: "IDNO / IDNP", ph: "1234567890123" }] },
      { fields: [{ key: "prestator_reprezentant", label: "Reprezentat prin", ph: "Funcția, Nume Prenume" }] },
    ],
  },
  {
    title: "Beneficiar (client / vânzător)",
    rows: [
      { fields: [{ key: "beneficiar_nume", label: "Numele și prenumele", ph: "Nume Prenume" }] },
      { fields: [{ key: "beneficiar_cetatenie", label: "Cetățean al", ph: "Republicii Moldova" }] },
      { fields: [{ key: "beneficiar_idnp", label: "IDNP", ph: "2004012345678" }] },
      { fields: [{ key: "beneficiar_domiciliu", label: "Domiciliu", ph: "Localitate, stradă, nr., ap." }] },
      { fields: [
        { key: "beneficiar_buletin_seria", label: "Buletin seria", ph: "A" },
        { key: "beneficiar_buletin_nr", label: "Buletin nr.", ph: "123456" },
      ] },
      { fields: [
        { key: "beneficiar_telefon", label: "Telefon", type: "tel", ph: "+373 69 000 000" },
        { key: "beneficiar_email", label: "E-mail", type: "email", ph: "grosu@email.com" },
      ] },
    ],
  },
  {
    title: "Imobil (Anexa nr. 1)",
    rows: [
      { fields: [{ key: "bun_tip", label: "Tip bun", ph: "apartament" }] },
      { fields: [{ key: "bun_adresa", label: "Adresa", ph: "Localitate, stradă, nr., ap." }] },
      { fields: [
        { key: "numar_cadastral", label: "Număr cadastral", ph: "0100225.041.0212" },
        { key: "suprafata", label: "Suprafața (m²)", type: "number", ph: "66.8" },
        { key: "nr_camere", label: "Nr. camere / destinație", ph: "2 camere" },
      ] },
      { fields: [{ key: "documente_proprietate", label: "Documente de proprietate", ph: "Contract de vânzare-cumpărare din 2009" }] },
      { fields: [
        { key: "pret_oferta", label: "Prețul de ofertă (cifre)", type: "number", ph: "72000" },
        { key: "c_pret_valuta", label: "Valuta", type: "select", options: ["euro", "lei"] },
      ] },
      { fields: [{ key: "particularitati", label: "Interdicții / grevări", ph: "fără sarcini" }] },
    ],
  },
  {
    title: "Condiții contract",
    rows: [
      {
        fields: [{ key: "durata_cifre", label: "Durata contractului (luni)", type: "number", ph: "3" }],
        hint: (f) => (f.durata_cifre ? `→ ${numToRoWords(f.durata_cifre)} luni` : ""),
      },
      { fields: [
        { key: "remuneratie_procent", label: "Remunerație (%)", type: "number", ph: "3" },
        { key: "penalitate_procent", label: "Penalitate întârziere (%/zi)", type: "number", ph: "0.1" },
      ] },
      { fields: [{ key: "modalitate_plata", label: "Modalitate de plată", type: "select", options: ["numerar", "virament bancar", "numerar sau virament bancar"] }] },
    ],
  },
];

const MODALS = {
  garantie: { title: "Garanție de cumpărare", sections: GARANTIE, required: ["vanzator_nume", "suma_garantie_cifre"] },
  contract: { title: "Contract de intermediere exclusiv", sections: CONTRACT, required: ["prestator_nume", "beneficiar_nume"] },
};
type TemplateName = keyof typeof MODALS;

// Предзаполнение из выбранной сделки (только подтверждённые данные).
function prefillFromTx(templateName: TemplateName, tx: {
  address: string | null; cadastralNo: string | null; clientName: string | null;
  clientPhone: string | null; objectType: string | null;
  extractedFields: { fieldName: string; value: string | null }[];
}): Record<string, string> {
  const ef = (name: string) => tx.extractedFields.find((f) => f.fieldName === name && f.value)?.value ?? "";
  const owner = tx.extractedFields.find((f) => f.fieldName === "owner_name" && f.value)?.value ?? "";
  const out: Record<string, string> = {};
  const put = (k: string, v: string | null | undefined) => { if (v) out[k] = v; };
  const cadastral = ef("cadastralNo") || tx.cadastralNo;
  const address = ef("address") || tx.address;
  if (templateName === "garantie") {
    put("numar_cadastral", cadastral);
    put("imobil_adresa", address);
    put("vanzator_nume", owner);
    put("vanzator_semnatura_nume", owner);
    put("imobil_descriere", tx.objectType);
  } else {
    put("numar_cadastral", cadastral);
    put("bun_adresa", address);
    put("beneficiar_nume", tx.clientName || owner);
    put("beneficiar_telefon", tx.clientPhone);
    put("bun_tip", tx.objectType);
    put("suprafata", ef("area_act") || ef("area_extras"));
    put("documente_proprietate", ef("legal_basis"));
    put("pret_oferta", ef("purchase_price"));
  }
  return out;
}

function DocModal({ templateName, txs, onClose }: { templateName: TemplateName; txs: TxOpt[]; onClose: () => void }) {
  const cfg = MODALS[templateName];
  const [form, setForm] = useState<Record<string, string>>({});
  const [txId, setTxId] = useState("manual");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSelectTx(id: string) {
    setTxId(id);
    if (id === "manual") return;
    try {
      const r = await fetch(`/api/transactions/${id}`);
      const d = await r.json();
      if (r.ok && d.transaction) setForm((f) => ({ ...f, ...prefillFromTx(templateName, d.transaction) }));
    } catch {}
  }

  async function submit() {
    for (const k of cfg.required) {
      if (!form[k]?.trim()) {
        alert("Completați cel puțin câmpurile principale (vânzător/beneficiar și suma/date).");
        return;
      }
    }
    setBusy(true);
    try {
      const r = await fetch("/api/tools/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName, data: form }),
      });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateName === "garantie" ? "Garantie_de_cumparare" : "Contract_intermediere"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      alert("Eroare la generarea documentului.");
    } finally {
      setBusy(false);
    }
  }

  const renderField = (fl: Field) => (
    <div className="field-group" key={fl.key}>
      <label>{fl.label}</label>
      {fl.type === "select" ? (
        <select value={form[fl.key] ?? fl.options?.[0] ?? ""} onChange={(e) => set(fl.key, e.target.value)}>
          {fl.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={fl.type === "number" ? "number" : fl.type === "date" ? "date" : fl.type === "tel" ? "tel" : fl.type === "email" ? "email" : "text"}
          placeholder={fl.ph}
          value={form[fl.key] ?? ""}
          onChange={(e) => set(fl.key, e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-hd">
          <h2>{cfg.title}</h2>
          <button className="btn" style={{ padding: "4px 10px" }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <div className="field-group">
            <label>Selectați tranzacția (prefil din datele verificate)</label>
            <select value={txId} onChange={(e) => onSelectTx(e.target.value)}>
              <option value="manual">Completare manuală (fără tranzacție)</option>
              {txs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.address || "fără adresă"}{t.clientName ? ` · ${t.clientName}` : ""}
                </option>
              ))}
            </select>
          </div>

          {cfg.sections.map((sec) => (
            <div key={sec.title}>
              <div className="modal-section">{sec.title}</div>
              {sec.rows.map((row, i) => {
                const cls = row.fields.length === 3 ? "field-row-3" : row.fields.length === 2 ? "field-row-2" : "";
                const hint = row.hint?.(form);
                return (
                  <div key={i}>
                    {cls ? <div className={cls}>{row.fields.map(renderField)}</div> : row.fields.map(renderField)}
                    {hint ? <div className="field-hint" style={{ color: "var(--blue)", marginBottom: 8 }}>{hint}</div> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onClose} disabled={busy}>Anulați</button>
          <button className="btn solid" onClick={submit} disabled={busy}>
            {busy ? "Se generează…" : "Generați documentul →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Шрифт DejaVu Sans Mono (Unicode, поддержка ș ț ă â î) для jsPDF — селектируемый текст.
// Кешируется в памяти модуля: TTF тянем из /public один раз, не на каждый экспорт.
let dejaVuBase64: string | null = null;
async function loadDejaVuBase64(): Promise<string> {
  if (dejaVuBase64) return dejaVuBase64;
  const res = await fetch("/fonts/DejaVuSansMono.ttf");
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  dejaVuBase64 = btoa(bin);
  return dejaVuBase64;
}

// Редактор шаблонного документа (Actele mele): загрузка версии пользователя или оригинала,
// правка в textarea, сохранение в БД, сброс к оригиналу, экспорт в .docx / .pdf (client-side).
function EditorModal({
  slug,
  title,
  onClose,
}: {
  slug: string;
  title: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [personalized, setPersonalized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/documents/${slug}`);
      const d = await r.json();
      if (r.ok) {
        setContent(d.content ?? "");
        setPersonalized(!!d.personalized);
      } else {
        setToast("Eroare la încărcarea documentului.");
      }
    } catch {
      setToast("Eroare la încărcarea documentului.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!dlOpen) return;
    function onDown(e: MouseEvent) {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) setDlOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dlOpen]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function save() {
    setBusy(true);
    try {
      const r = await fetch(`/api/documents/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error();
      setPersonalized(true);
      showToast("Salvat ✓");
    } catch {
      showToast("Eroare la salvare.");
    } finally {
      setBusy(false);
    }
  }

  async function resetToOriginal() {
    if (!confirm("Resetați la șablonul original? Versiunea dvs. salvată va fi ștearsă.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/documents/${slug}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      await load();
      showToast("Resetat la original.");
    } catch {
      showToast("Eroare la resetare.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocx() {
    setDlOpen(false);
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const doc = new Document({
      sections: [
        {
          children: content.split("\n").map(
            (line) => new Paragraph({ children: [new TextRun(line)] }),
          ),
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${slug}.docx`);
  }

  // PDF с встроенным TTF (DejaVu Sans Mono) → текст селектируемый, диакритика (ș ț ă â î) корректна.
  async function downloadPdf() {
    setDlOpen(false);
    setBusy(true);
    try {
      const [{ jsPDF }, b64] = await Promise.all([import("jspdf"), loadDejaVuBase64()]);
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      pdf.addFileToVFS("DejaVuSansMono.ttf", b64);
      pdf.addFont("DejaVuSansMono.ttf", "DejaVuSansMono", "normal");
      pdf.setFont("DejaVuSansMono");
      pdf.setFontSize(9);

      const margin = 40;
      const lh = 12;
      const maxW = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageH = pdf.internal.pageSize.getHeight() - margin;
      // Таб → 2 пробела (jsPDF не поддерживает табуляцию); перенос длинных строк по ширине.
      const lines = pdf.splitTextToSize((content || " ").replace(/\t/g, "  "), maxW) as string[];
      let y = margin;
      for (const line of lines) {
        if (y > pageH) {
          pdf.addPage();
          pdf.setFont("DejaVuSansMono");
          y = margin;
        }
        pdf.text(line, margin, y);
        y += lh;
      }
      pdf.save(`${slug}.pdf`);
    } catch {
      showToast("Eroare la generarea PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 760, width: "100%" }}>
        <div className="modal-hd">
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {title}
            {personalized && (
              <span className="badge b-purple" style={{ fontWeight: 500 }}>
                Versiune personalizată
              </span>
            )}
          </h2>
          <button className="btn" style={{ padding: "4px 10px" }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--ink3)" }}>Se încarcă…</p>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 420,
                fontFamily: "var(--mono, ui-monospace, monospace)",
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: "pre",
                overflowWrap: "normal",
                overflowX: "auto",
              }}
            />
          )}
        </div>
        <div className="modal-ft" style={{ justifyContent: "space-between" }}>
          <button className="btn" onClick={resetToOriginal} disabled={busy || loading || !personalized}>
            Resetează la original
          </button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" onClick={onClose} disabled={busy}>Anulare</button>
            <div ref={dlRef} style={{ position: "relative" }}>
              <button className="btn" onClick={() => setDlOpen((v) => !v)} disabled={loading}>
                ⬇ Descarcă ▾
              </button>
              {dlOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    right: 0,
                    background: "var(--card, #fff)",
                    border: "1px solid var(--line, #e2e8f0)",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    minWidth: 160,
                    zIndex: 10,
                    overflow: "hidden",
                  }}
                >
                  <button className="import-item" type="button" style={{ width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 13 }} onClick={downloadDocx}>
                    Word (.docx)
                  </button>
                  <button className="import-item" type="button" style={{ width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 13 }} onClick={downloadPdf}>
                    PDF
                  </button>
                </div>
              )}
            </div>
            <button className="btn solid" onClick={save} disabled={busy || loading}>
              {busy ? "Se salvează…" : "Salvează"}
            </button>
          </div>
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

export default function ActePage() {
  const [txs, setTxs] = useState<TxOpt[]>([]);
  const [modal, setModal] = useState<TemplateName | null>(null);
  const [editorSlug, setEditorSlug] = useState<string | null>(null);
  const editorMeta = ACTE_TEMPLATES_META.find((t) => t.slug === editorSlug);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => r.json())
      .then((d) =>
        setTxs(
          (d.transactions ?? [])
            .filter((t: { status: string }) => t.status !== "archive")
            .map((t: TxOpt) => ({ id: t.id, address: t.address, clientName: t.clientName })),
        ),
      )
      .catch(() => {});
  }, []);

  const TEMPLATE_CARDS = [
    { key: "garantie" as const, label: "Garanție de cumpărare", subtitle: "Recipisă privind primirea sumei de garanție" },
    { key: "contract" as const, label: "Contract de intermediere", subtitle: "Cu clauză de exclusivitate · contract cu clientul" },
  ];

  return (
    <div className="ig-page">
      <div className="ai-wrap">
        <div className="crumb">Actele mele</div>
        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 16 }}>Actele mele</h1>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-hd">
            <b>Acte / Contracte</b>
            <span className="badge b-gray" style={{ marginLeft: "auto" }}>șabloane</span>
          </div>
          <div className="card-bd">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TEMPLATE_CARDS.map((t, i) => (
                <div key={t.key} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 0", borderBottom: i < TEMPLATE_CARDS.length - 1 ? "1px dashed var(--line)" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>{t.subtitle}</div>
                  </div>
                  <button className="btn" onClick={() => setModal(t.key)}>Completați →</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Documente editabile (șabloane din docs/templates) */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-hd">
            <b>Documente șablon</b>
            <span className="badge b-gray" style={{ marginLeft: "auto" }}>editabile</span>
          </div>
          <div className="card-bd">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ACTE_TEMPLATES_META.map((t, i) => (
                <div key={t.slug} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 0", borderBottom: i < ACTE_TEMPLATES_META.length - 1 ? "1px dashed var(--line)" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>{t.subtitle}</div>
                  </div>
                  <button className="btn" onClick={() => setEditorSlug(t.slug)}>Deschide</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modal && <DocModal templateName={modal} txs={txs} onClose={() => setModal(null)} />}
      {editorSlug && editorMeta && (
        <EditorModal slug={editorSlug} title={editorMeta.title} onClose={() => setEditorSlug(null)} />
      )}
    </div>
  );
}
