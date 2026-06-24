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
      { fields: [{ key: "vanzator_semnatura_nume", label: "Vânzător/reprezentat de agent imobiliar (nume pentru semnătură)", ph: "Nume Prenume" }] },
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

// Сборка .docx (docx.js) из текста — для скачивания и для предпросмотра отредактированной версии.
async function buildDocxBlob(text: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const doc = new Document({
    sections: [
      {
        children: text.split("\n").map(
          (line) => new Paragraph({ children: [new TextRun(line)] }),
        ),
      },
    ],
  });
  return Packer.toBlob(doc);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
}

// Комбинированный TSV-текст («=== Лист ===» + строки) → карта {имя листа → TSV}.
export type SheetMap = { names: string[]; tsv: Record<string, string> };
function parseSheetMap(text: string): SheetMap {
  const blocks: { name: string; rows: string[] }[] = [];
  let cur: { name: string; rows: string[] } | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^===\s*(.+?)\s*===$/);
    if (m) {
      cur = { name: m[1], rows: [] };
      blocks.push(cur);
    } else {
      if (!cur) {
        cur = { name: "Foaie 1", rows: [] };
        blocks.push(cur);
      }
      cur.rows.push(line);
    }
  }
  const names: string[] = [];
  const tsv: Record<string, string> = {};
  for (const b of blocks) {
    const rows = [...b.rows];
    while (rows.length && rows[rows.length - 1].trim() === "") rows.pop();
    names.push(b.name);
    tsv[b.name] = rows.join("\n");
  }
  if (!names.length) {
    names.push("Foaie 1");
    tsv["Foaie 1"] = "";
  }
  return { names, tsv };
}

// Ячейка Excel для рендера (стиль приходит с сервера через exceljs; для TSV — пустой).
type ExcelCell = { text: string; style?: string };

// TSV одного листа → матрица ячеек (фолбэк для правленной версии без стилей).
function tsvToCells(tsv: string): ExcelCell[][] {
  const rows = tsv.split("\n");
  while (rows.length && rows[rows.length - 1].trim() === "") rows.pop();
  if (!rows.length) return [[{ text: "" }]];
  return rows.map((r) => r.split("\t").map((t) => ({ text: t })));
}

// Матрица ячеек → редактируемая HTML-таблица: служебная строка (× колонок) + левый
// желобок (× строк) + ячейки contenteditable с inline-стилями.
function buildEditableTableHtml(cells: ExcelCell[][]): string {
  const data = cells.length ? cells : [[{ text: "" }]];
  const colCount = Math.max(1, ...data.map((r) => r.length));
  let html = '<table id="excel-table"><tr class="xls-ctrl-row"><td class="xls-corner"></td>';
  for (let c = 0; c < colCount; c++) {
    html += '<td class="xls-col-ctrl"><button type="button" class="xls-col-ctrl-btn" title="Șterge coloana">×</button></td>';
  }
  html += "</tr>";
  for (const row of data) {
    html += '<tr><td class="xls-row-ctrl"><button type="button" class="xls-row-ctrl-btn" title="Șterge rândul">×</button></td>';
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? { text: "" };
      const style = cell.style ? ` style="${cell.style}"` : "";
      html += `<td contenteditable="true"${style}>${escapeHtml(cell.text || "")}</td>`;
    }
    html += "</tr>";
  }
  html += "</table>";
  return html;
}

// Считывает редактируемую таблицу обратно в TSV (пропуская служебную строку и желобок).
function readEditableTable(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .slice(1) // пропустить служебную строку (× колонок)
    .map((tr) =>
      Array.from(tr.cells)
        .slice(1) // пропустить желобок (× строки)
        .map((c) => (c.textContent ?? "").replace(/[\t\n]/g, " "))
        .join("\t"),
    )
    .join("\n");
}

// Редактор шаблонного документа (Actele mele): загрузка версии пользователя или оригинала,
// правка в textarea, сохранение в БД, сброс к оригиналу, экспорт в .docx / .pdf (client-side).
function EditorModal({
  slug,
  title,
  type,
  onClose,
}: {
  slug: string;
  title: string;
  type: "docx" | "xlsx";
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [personalized, setPersonalized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const dlRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // XLSX: стилизованные листы оригинала (с сервера, exceljs), текущий и базовый TSV по листам,
  // набор реально отредактированных листов и последняя сфокусированная ячейка.
  const styledSheetsRef = useRef<Record<string, ExcelCell[][]>>({});
  const sheetTsvRef = useRef<Record<string, string>>({});
  const baselineRef = useRef<Record<string, string>>({});
  const editedRef = useRef<Set<string>>(new Set());
  const focusRef = useRef<{ row: number; col: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/documents/${slug}`);
      const d = await r.json();
      if (!r.ok) throw new Error();
      const text: string = d.content ?? "";
      setContent(text);
      setPersonalized(!!d.personalized);
      if (type === "xlsx") {
        const { names, tsv } = parseSheetMap(text);
        sheetTsvRef.current = { ...tsv };
        baselineRef.current = { ...tsv };
        editedRef.current = new Set();
        focusRef.current = null;
        styledSheetsRef.current = {};
        // Оригинал → грузим стили ячеек с сервера (exceljs): цвета, жирность, границы.
        if (!d.personalized) {
          try {
            const rc = await fetch(`/api/documents/${slug}/cells`);
            const cd = await rc.json();
            if (rc.ok && Array.isArray(cd.sheets)) {
              for (const s of cd.sheets as { name: string; rows: ExcelCell[][] }[]) {
                styledSheetsRef.current[s.name] = s.rows;
              }
            }
          } catch {
            /* без стилей — рендер из TSV */
          }
        }
        setSheetNames(names);
        setActiveSheet(0);
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

  // Визуальный + редактируемый рендер. .docx → docx-preview в contentEditable-контейнере;
  // .xlsx → активный лист (стилизованные ячейки оригинала, иначе из TSV) с td contentEditable.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const el = previewRef.current;
      if (!el) return;

      if (type === "xlsx") {
        const name = sheetNames[activeSheet];
        if (!name) return;
        const styled = styledSheetsRef.current[name];
        const useStyled = !personalized && styled && !editedRef.current.has(name);
        const cells = useStyled ? styled : tsvToCells(sheetTsvRef.current[name] ?? "");
        if (cancelled || !previewRef.current) return;
        el.contentEditable = "false";
        el.innerHTML = buildEditableTableHtml(cells);
        focusRef.current = null;

        // Делегирование: удаление колонки/строки + запоминание выбранной ячейки (по клику).
        el.onclick = (e) => {
          const target = e.target as HTMLElement;
          const table = el.querySelector("table") as HTMLTableElement | null;
          if (!table) return;
          if (target.classList.contains("xls-col-ctrl-btn")) {
            const idx = (target.closest("td") as HTMLTableCellElement)?.cellIndex;
            if (idx == null || idx < 1) return;
            if (!confirm("Ștergeți coloana?")) return;
            Array.from(table.rows).forEach((r) => {
              if (r.cells[idx]) r.deleteCell(idx);
            });
            editedRef.current.add(name);
            return;
          }
          if (target.classList.contains("xls-row-ctrl-btn")) {
            const ri = (target.closest("tr") as HTMLTableRowElement)?.rowIndex;
            if (ri == null || ri < 1) return;
            if (!confirm("Ștergeți rândul?")) return;
            table.deleteRow(ri);
            editedRef.current.add(name);
            return;
          }
          // Клик по ячейке данных → запоминаем позицию для вставки «после выбранной».
          const td = target.closest("td") as HTMLTableCellElement | null;
          const tr = td?.parentElement as HTMLTableRowElement | null;
          if (td && tr && td.cellIndex > 0 && tr.rowIndex > 0) {
            focusRef.current = { row: tr.rowIndex, col: td.cellIndex };
          }
        };
        return;
      }

      // .docx — рендер в редактируемый контейнер.
      el.innerHTML = "";
      try {
        let buf: ArrayBuffer;
        if (personalized) {
          buf = await (await buildDocxBlob(content)).arrayBuffer();
        } else {
          const r = await fetch(`/api/documents/${slug}/original`);
          if (!r.ok) throw new Error();
          buf = await r.arrayBuffer();
        }
        if (cancelled || !previewRef.current) return;
        const { renderAsync } = await import("docx-preview");
        await renderAsync(buf, previewRef.current, undefined, {
          className: "docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
        });
        if (cancelled || !previewRef.current) return;
        previewRef.current.contentEditable = "true";
        previewRef.current.style.outline = "none";
      } catch {
        if (previewRef.current) {
          previewRef.current.innerHTML =
            '<div style="padding:16px;color:#64748b;font-size:13px">Eroare la previzualizare.</div>';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, content, personalized, type, slug, sheetNames, activeSheet]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  // XLSX: считываем текущую таблицу активного листа в TSV (помечаем лист как изменённый).
  function captureActiveSheet() {
    if (type !== "xlsx") return;
    const name = sheetNames[activeSheet];
    const table = previewRef.current?.querySelector("table");
    if (!table || !name) return;
    const tsv = readEditableTable(table as HTMLTableElement);
    sheetTsvRef.current[name] = tsv;
    if (tsv !== (baselineRef.current[name] ?? "")) editedRef.current.add(name);
  }

  function switchSheet(i: number) {
    if (i === activeSheet) return;
    captureActiveSheet();
    setActiveSheet(i);
  }

  function markActiveEdited() {
    const name = sheetNames[activeSheet];
    if (name) editedRef.current.add(name);
  }

  // Добавить колонку (после выбранной ячейки или в конец).
  function addColumn() {
    const table = previewRef.current?.querySelector("table") as HTMLTableElement | null;
    if (!table || !table.rows.length) return;
    const ctrlLen = table.rows[0].cells.length; // желобок/угол + колонки
    const insertAt = focusRef.current ? Math.min(focusRef.current.col + 1, ctrlLen) : ctrlLen;
    Array.from(table.rows).forEach((r, ri) => {
      const at = Math.min(insertAt, r.cells.length);
      const cell = r.insertCell(at);
      if (ri === 0) {
        cell.className = "xls-col-ctrl";
        cell.innerHTML = '<button type="button" class="xls-col-ctrl-btn" title="Șterge coloana">×</button>';
      } else {
        cell.setAttribute("contenteditable", "true");
      }
    });
    markActiveEdited();
  }

  // Добавить строку (после выбранной строки или в конец).
  function addRow() {
    const table = previewRef.current?.querySelector("table") as HTMLTableElement | null;
    if (!table || !table.rows.length) return;
    const colCount = table.rows[0].cells.length - 1; // без угла
    const insertAt = focusRef.current
      ? Math.min(focusRef.current.row + 1, table.rows.length)
      : table.rows.length;
    const tr = table.insertRow(insertAt);
    const gutter = tr.insertCell();
    gutter.className = "xls-row-ctrl";
    gutter.innerHTML = '<button type="button" class="xls-row-ctrl-btn" title="Șterge rândul">×</button>';
    for (let c = 0; c < colCount; c++) {
      tr.insertCell().setAttribute("contenteditable", "true");
    }
    markActiveEdited();
  }

  // Текущее содержимое (с учётом несохранённых правок) — для сохранения и скачивания.
  function readCurrent(): string {
    if (type === "docx") return previewRef.current?.innerText ?? content;
    captureActiveSheet();
    return sheetNames.map((n) => `=== ${n} ===\n${sheetTsvRef.current[n] ?? ""}`).join("\n\n");
  }

  async function save() {
    setBusy(true);
    try {
      const text = readCurrent();
      const r = await fetch(`/api/documents/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) throw new Error();
      setContent(text);
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
    downloadBlob(await buildDocxBlob(readCurrent()), `${slug}.docx`);
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
      const lines = pdf.splitTextToSize((readCurrent() || " ").replace(/\t/g, "  "), maxW) as string[];
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
            <>
              {type === "xlsx" && sheetNames.length > 1 && (
                <div className="lang-tabs" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                  {sheetNames.map((n, i) => (
                    <button
                      key={n}
                      type="button"
                      className={`lang-tab${i === activeSheet ? " on" : ""}`}
                      onClick={() => switchSheet(i)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {type === "xlsx" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button className="btn" type="button" onClick={addColumn} style={{ fontSize: 12 }}>
                    + Coloană
                  </button>
                  <button className="btn" type="button" onClick={addRow} style={{ fontSize: 12 }}>
                    + Rând
                  </button>
                </div>
              )}
              <div
                ref={previewRef}
                className={
                  type === "xlsx" ? "acte-excel-preview" : "acte-docx-preview acte-docx-editable"
                }
                title={type === "docx" ? "Faceți clic pentru a edita" : undefined}
              />
              <p style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 8 }}>
                {type === "docx"
                  ? "Faceți clic în document pentru a edita. Salvați cu „Salvează”."
                  : "Faceți clic într-o celulă pentru a edita. Salvați cu „Salvează”."}
              </p>
            </>
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
        <EditorModal
          slug={editorSlug}
          title={editorMeta.title}
          type={editorMeta.type}
          onClose={() => setEditorSlug(null)}
        />
      )}
    </div>
  );
}
