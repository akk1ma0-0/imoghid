// «Fișa obiectului» (Pasul 7): маппинг данных транзакции → структура отчёта + генерация .docx.
// Клиентский модуль (docx.js грузится динамически). Серверных импортов нет.
import type { Paragraph as DocxParagraph, Table as DocxTable } from "docx";
import { dealLabel } from "./constants";
import type { FlowTx } from "./types";

export type KV = Record<string, string>;
export type Row2 = { rol: string; nume: string; idnp: string };
export type RowVerif = { aspect: string; rezultat: string };
export type RowPachet = { document: string; status: string };

export type ReportData = {
  general: { tipTranzactie: string; adresa: string; cadastral: string; vanzator: string; cumparator: string; dataRaport: string; agent: string };
  concluzie: string;
  obiect: { suprafata: string; destinatie: string; valoare: string; alteDrepturi: string; notari: string; interdictii: string };
  parti: Row2[];
  verificare: RowVerif[];
  semnale: { stop: string; atentie: string; info: string };
  pachet: RowPachet[];
  calcule: { pret: string; impozit: string; notar: string; altele: string };
  pasi: string;
  dosarNotar: string;
  temeiLegal: string;
};

function todayRo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const TEMEI_DEFAULT: Record<string, string> = {
  VANZARE_CUMPARARE: "Codul civil al RM — contract de vânzare-cumpărare",
  DONATIE: "Codul civil al RM — contract de donație",
  SCHIMB: "Codul civil al RM — contract de schimb",
  ALT_TIP: "Codul civil al RM",
};

// Строит начальную структуру отчёта из данных транзакции (объект 1).
export function buildInitialReport(tx: FlowTx, agentName: string): ReportData {
  const fields = tx.extractedFields.filter((f) => f.objectIndex === 1);
  const ef = (name: string) => fields.find((f) => f.fieldName === name && f.value)?.value ?? "";
  const flags = tx.flags.filter((f) => f.objectIndex === 1);
  const hasCode = (code: string) => flags.some((f) => f.code === code);
  const reds = flags.filter((f) => f.severity === "RED");
  const ambers = flags.filter((f) => f.severity === "AMBER");
  const greens = flags.filter((f) => f.severity === "GREEN");
  const owners = tx.owners.filter((o) => o.objectIndex === 1);

  let verI: { alteDrepturiReale?: boolean; notari?: boolean; interdictii?: boolean; suprafata?: string; destinatie?: string; valoare?: string } | null = null;
  if (tx.verificareImobil) {
    try {
      verI = JSON.parse(tx.verificareImobil);
    } catch {
      verI = null;
    }
  }

  const vanzator = owners[0]?.fullName || ef("owner_name") || "";

  const concluzie = reds.length
    ? "Conform verificării, tranzacția are blocaje care trebuie rezolvate înainte de notar."
    : ambers.length
      ? "Conform verificării, tranzacția necesită clarificări înainte de a continua."
      : "Conform verificării, tranzacția poate continua.";

  const signal = (verExists: boolean | undefined, code: string): string =>
    hasCode(code) || verExists ? "Există" : "";

  const parti: Row2[] = [];
  if (owners.length) {
    owners.forEach((o, i) => parti.push({ rol: i === 0 ? "Vânzător" : "Coproprietar", nume: o.fullName, idnp: "" }));
  } else {
    parti.push({ rol: "Vânzător", nume: vanzator, idnp: "" });
  }
  parti.push({ rol: "Cumpărător", nume: tx.clientName || "", idnp: "" });

  const verificare: RowVerif[] = flags.map((f) => ({
    aspect: f.titleRo,
    rezultat: f.severity === "GREEN" ? "Verificat" : f.severity === "AMBER" ? "Atenție" : "Blocaj",
  }));

  let pachet: RowPachet[] = tx.notarChecklist.map((c) => ({
    document: c.labelRo,
    status: c.isUploaded ? "prezent" : "lipsește",
  }));
  if (!pachet.length) {
    pachet = tx.documents
      .filter((d) => d.objectIndex === 1)
      .map((d) => ({ document: d.fileName, status: "prezent" }));
  }

  const actiuni = [...reds, ...ambers].map((f) => `Rezolvați: ${f.titleRo}`);
  const lipsa = tx.notarChecklist.filter((c) => !c.isUploaded).map((c) => `Obțineți: ${c.labelRo}`);

  const legalRefs = Array.from(
    new Set(flags.map((f) => f.legalRef).filter((x): x is string => !!x)),
  );

  return {
    general: {
      tipTranzactie: dealLabel(tx.dealType),
      adresa: tx.address || "",
      cadastral: tx.cadastralNo || ef("cadastralNo") || "",
      vanzator,
      cumparator: tx.clientName || "",
      dataRaport: todayRo(),
      agent: agentName || "",
    },
    concluzie,
    obiect: {
      suprafata: tx.suprafata || verI?.suprafata || "",
      destinatie: tx.destinatie || verI?.destinatie || "",
      valoare: tx.valoare || verI?.valoare || "",
      alteDrepturi: signal(verI?.alteDrepturiReale, "VER_ALTE_DREPTURI"),
      notari: signal(verI?.notari, "VER_NOTARI"),
      interdictii: hasCode("VER_INTERDICTII") || verI?.interdictii
        ? "Există"
        : hasCode("NO_ENCUMBRANCE")
          ? "Nu există"
          : "",
    },
    parti,
    verificare,
    semnale: {
      stop: reds.map((f) => f.titleRo).join("\n"),
      atentie: ambers.map((f) => f.titleRo).join("\n"),
      info: greens.map((f) => f.titleRo).join("\n"),
    },
    pachet,
    calcule: {
      pret: tx.calculation?.sellPrice != null ? String(tx.calculation.sellPrice) : "",
      impozit: "",
      notar: "",
      altele: "",
    },
    pasi: actiuni.length ? actiuni.join("\n") : "Tranzacția poate continua la notar.",
    dosarNotar: lipsa.length ? lipsa.join("\n") : "Toate documentele necesare sunt prezente.",
    temeiLegal: legalRefs.length ? legalRefs.join("\n") : TEMEI_DEFAULT[tx.dealType] ?? TEMEI_DEFAULT.ALT_TIP,
  };
}

const dash = (s: string) => (s && s.trim() ? s.trim() : "–");

// Поля, требующие заполнения (для индикатора «X câmpuri necesită completare»).
export function emptyFieldCount(d: ReportData): number {
  let n = 0;
  const check = (s: string) => {
    if (!s || !s.trim()) n++;
  };
  Object.values(d.general).forEach(check);
  Object.values(d.obiect).forEach(check);
  Object.values(d.calcule).forEach(check);
  d.parti.forEach((p) => {
    check(p.nume);
    check(p.idnp);
  });
  return n;
}

// Генерация .docx из данных отчёта (docx.js). Пустые поля → «–».
export async function buildReportDocx(d: ReportData): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } =
    await import("docx");

  const H = (text: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text })] });
  const KVp = (label: string, value: string) =>
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: dash(value) })] });
  const P = (text: string) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: dash(text) })] });
  const lines = (text: string) =>
    (text && text.trim() ? text.split("\n") : ["–"]).map(
      (l) => new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: dash(l) })] }),
    );

  const cell = (text: string, bold = false) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: dash(text), bold })] })],
    });
  const table = (headers: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map((h) => cell(h, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
      ],
    });

  const children: (DocxParagraph | DocxTable)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Fișa obiectului" })] }),

    H("1. Date generale"),
    KVp("Tip tranzacție", d.general.tipTranzactie),
    KVp("Obiect (adresă)", d.general.adresa),
    KVp("Număr cadastral", d.general.cadastral),
    KVp("Vânzător", d.general.vanzator),
    KVp("Cumpărător", d.general.cumparator),
    KVp("Data raportului", d.general.dataRaport),
    KVp("Agent", d.general.agent),

    H("2. Concluzie"),
    P(d.concluzie),

    H("3. Obiectul tranzacției"),
    KVp("Suprafață", d.obiect.suprafata),
    KVp("Destinație", d.obiect.destinatie),
    KVp("Valoare estimată", d.obiect.valoare),
    KVp("Alte drepturi reale", d.obiect.alteDrepturi),
    KVp("Notări", d.obiect.notari),
    KVp("Interdicții", d.obiect.interdictii),

    H("4. Părțile"),
    table(["Rol", "Nume", "IDNP"], d.parti.map((p) => [p.rol, p.nume, p.idnp])),

    H("5. Rezultatele verificării"),
    table(["Aspect", "Rezultat"], d.verificare.length ? d.verificare.map((v) => [v.aspect, v.rezultat]) : [["–", "–"]]),

    H("6. Semnale și riscuri"),
    new Paragraph({ children: [new TextRun({ text: "STOP (blocaje):", bold: true })] }),
    ...lines(d.semnale.stop),
    new Paragraph({ children: [new TextRun({ text: "Atenție:", bold: true })] }),
    ...lines(d.semnale.atentie),
    new Paragraph({ children: [new TextRun({ text: "Info:", bold: true })] }),
    ...lines(d.semnale.info),

    H("7. Completitudinea pachetului"),
    table(["Document", "Status"], d.pachet.length ? d.pachet.map((p) => [p.document, p.status]) : [["–", "–"]]),

    H("8. Calcule"),
    KVp("Preț", d.calcule.pret),
    KVp("Impozit", d.calcule.impozit),
    KVp("Cheltuieli notariale", d.calcule.notar),
    KVp("Alte cheltuieli", d.calcule.altele),

    H("9–10. Pași următori și dosar notar"),
    new Paragraph({ children: [new TextRun({ text: "Pași următori:", bold: true })] }),
    ...lines(d.pasi),
    new Paragraph({ children: [new TextRun({ text: "Dosar pentru notar:", bold: true })] }),
    ...lines(d.dosarNotar),

    H("11. Temei legal"),
    ...lines(d.temeiLegal),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}
