"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { numToRoWords } from "@/lib/ro-words";

type TxOpt = { id: string; address: string | null; clientName: string | null };
type Cma = { segment: string; avgPricePerM2: number; avgDaysToSell: number; count90d: number };
// (Cma — статистика CMA из /api/tools/cma)

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
      { fields: [{ key: "agent_nume", label: "Numele și prenumele agentului", ph: "Popescu Ion" }] },
      { fields: [
        { key: "agent_buletin_seria", label: "Buletin seria", ph: "A" },
        { key: "agent_buletin_nr", label: "Buletin nr.", ph: "123456" },
      ] },
      { fields: [{ key: "agent_domiciliu", label: "Domiciliu agent", ph: "str. Independenței 1, Chișinău" }] },
      { fields: [{ key: "contract_intermediere_nr", label: "Contractul de intermediere nr.", ph: "42" }] },
      { fields: [{ key: "contract_intermediere_data", label: "Data contractului de intermediere", type: "date" }] },
    ],
  },
  {
    title: "Vânzător (proprietar)",
    rows: [{ fields: [{ key: "vanzator_nume", label: "Numele și prenumele vânzătorului", ph: "Grosu Maria" }] }],
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
      { fields: [{ key: "imobil_adresa", label: "Adresa imobilului", ph: "str. Cetatea Albă 143/1, ap. 32, Chișinău" }] },
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
      { fields: [{ key: "vanzator_semnatura_nume", label: "Vânzător / reprezentant (nume pentru semnătură)", ph: "Grosu Maria" }] },
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
      { fields: [{ key: "prestator_nume", label: "Denumirea agenției / Numele agentului", ph: "SRL ImoGhid sau Popescu Ion" }] },
      { fields: [{ key: "prestator_adresa", label: "Sediu / Adresă", ph: "str. Independenței 1, Chișinău" }] },
      { fields: [{ key: "prestator_idno", label: "IDNO / IDNP", ph: "1234567890123" }] },
      { fields: [{ key: "prestator_reprezentant", label: "Reprezentat prin", ph: "Director Popescu Ion" }] },
    ],
  },
  {
    title: "Beneficiar (client / vânzător)",
    rows: [
      { fields: [{ key: "beneficiar_nume", label: "Numele și prenumele", ph: "Grosu Maria" }] },
      { fields: [{ key: "beneficiar_cetatenie", label: "Cetățean al", ph: "Republicii Moldova" }] },
      { fields: [{ key: "beneficiar_idnp", label: "IDNP", ph: "2004012345678" }] },
      { fields: [{ key: "beneficiar_domiciliu", label: "Domiciliu", ph: "str. Cetatea Albă 143/1, ap. 32, Chișinău" }] },
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
      { fields: [{ key: "bun_adresa", label: "Adresa", ph: "str. Cetatea Albă 143/1, ap. 32, Chișinău" }] },
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

export default function InstrumentePage() {
  const [txs, setTxs] = useState<TxOpt[]>([]);
  const [cma, setCma] = useState<Cma | null>(null);
  const [modal, setModal] = useState<TemplateName | null>(null);

  const [reportTx, setReportTx] = useState("");

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
    fetch("/api/tools/cma").then((r) => r.json()).then(setCma).catch(() => {});
  }, []);

  const TEMPLATE_CARDS = [
    { key: "garantie" as const, label: "Garanție de cumpărare", subtitle: "Recipisă privind primirea sumei de garanție" },
    { key: "contract" as const, label: "Contract de intermediere", subtitle: "Cu clauză de exclusivitate · contract cu clientul" },
  ];

  return (
    <div className="ig-page">
      <div className="ai-wrap">
        <div className="crumb">Instrumente</div>
        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 16 }}>Instrumente</h1>

        {/* 1. Generare anunț — перенесено в Creator (платформа 999.md) */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-hd">
            <b>Generare anunț</b>
            <span className="badge b-purple" style={{ marginLeft: "auto" }}>mutat în Creator</span>
          </div>
          <div className="card-bd">
            <p style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.6, marginBottom: 12 }}>
              Generatorul de anunțuri (RO + RU) a fost mutat în <b>Creator</b> — platforma „999.md”.
              Acolo puteți importa obiectul din dosar și genera textul anunțului.
            </p>
            <Link className="btn solid" href="/app/creator?platform=999">
              Deschideți în Creator →
            </Link>
          </div>
        </div>

        {/* 2. Acte / Contracte */}
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

        {/* 3. CMA */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-hd">
            <b>Analiză de piață (CMA) — {cma?.segment ?? "sec. Ciocana, 2 odăi"}</b>
            <span className="badge b-gray" style={{ marginLeft: "auto" }}>{cma ? `${cma.count90d} analize · date demo` : "date demo"}</span>
          </div>
          <div className="card-bd">
            <div className="cma-stats">
              <div className="stat-box"><div className="stat-val">{cma ? cma.avgPricePerM2.toLocaleString("ro-MD") : "—"}</div><div className="stat-lbl">€/m² medie</div></div>
              <div className="stat-box"><div className="stat-val">{cma ? `${cma.avgDaysToSell} zile` : "—"}</div><div className="stat-lbl">timp mediu de vânzare</div></div>
              <div className="stat-box"><div className="stat-val">{cma ? cma.count90d : "—"}</div><div className="stat-lbl">anunțuri în 90 zile</div></div>
            </div>
            <div className="note">Date demo bazate pe anunțurile din modulul 999. Utilizați-le ca argument la negocierea prețului cu proprietarul.</div>
          </div>
        </div>

        {/* 4. Raport PDF */}
        <div className="card">
          <div className="card-hd">
            <b>Raport pentru client (PDF)</b>
          </div>
          <div className="card-bd">
            <div className="field-group">
              <label>Selectați tranzacția</label>
              <select value={reportTx} onChange={(e) => setReportTx(e.target.value)}>
                <option value="">— alegeți —</option>
                {txs.map((t) => <option key={t.id} value={t.id}>{t.address || "fără adresă"}{t.clientName ? ` · ${t.clientName}` : ""}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 12 }}>
              Raportul include: rezultatele verificării actelor, semnalele identificate, analiza de piață (CMA), datele de contact ale agentului și branding-ul agenției.
            </div>
            <button className="btn solid" onClick={() => alert("Generarea raportului PDF — în MVP.")}>⤓ Generați raportul</button>
          </div>
        </div>
      </div>

      {modal && <DocModal templateName={modal} txs={txs} onClose={() => setModal(null)} />}
    </div>
  );
}
