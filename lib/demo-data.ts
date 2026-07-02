// Mod Demo — моковые данные для интерактивного тура по платформе.
// Демо не персистентно (sessionStorage + session-cookie), реальных вызовов API/Claude нет.

export const DEMO_TRANSACTION = {
  id: "demo",
  dealType: "vanzare",
  step1Data: {
    address: "mun. Chișinău, sect. Botanica, str. Decebal 99/A ap.40",
    cadastralNumber: "0100109.128.01.143",
    suprafata: "59.70",
    destinatie: "Locativă",
    valoare: "382252",
  },
  step2Data: {
    documents: [
      { name: "Contract_vanzare_cumparare.pdf", status: "demo" },
      { name: "Extras_RBI.pdf", status: "demo" },
      { name: "Buletin_vanzator.pdf", status: "demo" },
    ],
  },
  step3Data: {
    ownerName: "IONESCU MARIA",
    ownershipBasis: "Contract de vânzare-cumpărare nr. 1234/2019",
    ownerCota: "1/2",
    spouseConsent: true,
    flags: [
      {
        code: "GREEN",
        severity: "GREEN",
        titleRo: "Drept de proprietate confirmat",
        descriptionRo: "Proprietarul este identificat conform documentelor încărcate.",
      },
      {
        code: "AMBER",
        severity: "AMBER",
        titleRo: "Consimțământul soțului necesar",
        descriptionRo: "Bunul face parte din proprietatea comună. Este necesară declarația notarială a soțului.",
        legalRef: "Codul familiei RM, art. 22",
      },
      {
        code: "NO_EXTRAS_RBI",
        severity: "AMBER",
        titleRo: "Lipsește extrasul din RBI",
        descriptionRo: "Pentru confirmare oficială solicitați extrasul din Registrul bunurilor imobile.",
      },
    ],
    objectComparison: {
      suprafataDoc: "59.70",
      suprafataCadastru: "59.70",
      match: true,
      destinatieDoc: "Locativă",
      destinatieCadastru: "Locativă",
      alteDrepturiReale: false,
      notari: false,
      interdictii: false,
    },
  },
  step4Data: { owners: [{ name: "IONESCU MARIA", cota: "1/2" }, { name: "IONESCU VASILE", cota: "1/2" }] },
  step5Data: { party1Name: "Ionescu Maria", party2Name: "Popescu Alexandru" },
  step6Data: { pretVanzare: "95000", valuta: "EUR" },
  step7Data: { ready: true },
} as const;

export const DEMO_STEPS: { n: number; title: string; sub: string }[] = [
  { n: 1, title: "Date obiect", sub: "adresă, nr. cadastral" },
  { n: 2, title: "Încărcare", sub: "acte aferente" },
  { n: 3, title: "Verificare acte", sub: "analiză Gheorghii" },
  { n: 4, title: "Coproprietari", sub: "cote de proprietate" },
  { n: 5, title: "Lista pentru notar", sub: "acte pe părți" },
  { n: 6, title: "Plăți", sub: "impozit, notariat" },
  { n: 7, title: "Fișa obiectului", sub: "raport pentru notar" },
  { n: 8, title: "Finalizare", sub: "dosar complet" },
];

// Демо-расчёты для шага 6 (статичные оценки, без реального калькулятора).
export const DEMO_CALC = {
  pret: "95 000 EUR",
  impozitVanzator: "≈ 0 lei (scutire — proprietate > 3 ani)",
  onorariuNotar: "≈ 8 200 lei",
  taxaInregistrare: "≈ 1 400 lei",
  total: "≈ 9 600 lei (cheltuieli notariale + înregistrare)",
};

// Демо-результат генерации в Creator Hub.
export const DEMO_CREATOR_CONTENT = {
  post: "Știați că din 2027 agenții imobiliari din Moldova trebuie să fie certificați? Iată ce trebuie să știți despre Legea 40/2026 și cum vă pregătiți din timp.",
  hashtags: "#imobiliare #chisinau #agentimobiliar #legea402026",
  slides: [
    "Legea 40/2026",
    "Ce se schimbă?",
    "Certificarea devine obligatorie",
    "Termen: ianuarie 2027",
    "ImoGhid te pregătește",
  ],
};

// Демо-данные кадастрового результата (этап 1).
export const DEMO_CADASTRU_RESULT = {
  cadastralNo: DEMO_TRANSACTION.step1Data.cadastralNumber,
  addr: DEMO_TRANSACTION.step1Data.address,
  supr: `${DEMO_TRANSACTION.step1Data.suprafata} m²`,
  dest: DEMO_TRANSACTION.step1Data.destinatie,
  val: `${DEMO_TRANSACTION.step1Data.valoare} lei`,
  prop: "Privată",
  dr: "Nu există",
  not: "Nu există",
  int: "Nu există",
};

// Демо-данные для генерации .docx «Fișa obiectului» (структура ReportData из flow/report.ts).
import type { ReportData } from "@/app/app/_components/flow/report";

export function buildDemoReportData(today: string): ReportData {
  const d = DEMO_TRANSACTION;
  return {
    general: {
      tipTranzactie: "Vânzare-cumpărare",
      adresa: d.step1Data.address,
      cadastral: d.step1Data.cadastralNumber,
      vanzator: d.step3Data.ownerName,
      cumparator: d.step5Data.party2Name,
      dataRaport: today,
      agent: "Agent Demo",
    },
    concluzie: "Conform verificării, tranzacția necesită clarificări înainte de a continua.",
    obiect: {
      suprafata: `${d.step1Data.suprafata} m²`,
      destinatie: d.step1Data.destinatie,
      valoare: `${d.step1Data.valoare} lei`,
      alteDrepturi: "Nu există",
      notari: "Nu există",
      interdictii: "Nu există",
    },
    parti: [
      { rol: "Vânzător", nume: d.step5Data.party1Name, idnp: "" },
      { rol: "Cumpărător", nume: d.step5Data.party2Name, idnp: "" },
    ],
    verificare: d.step3Data.flags.map((f) => ({
      aspect: f.titleRo,
      rezultat: f.severity === "GREEN" ? "Verificat" : f.severity === "AMBER" ? "Atenție" : "Blocaj",
    })),
    semnale: {
      stop: "",
      atentie: d.step3Data.flags.filter((f) => f.severity === "AMBER").map((f) => f.titleRo).join("\n"),
      info: d.step3Data.flags.filter((f) => f.severity === "GREEN").map((f) => f.titleRo).join("\n"),
    },
    pachet: [
      { document: "Contract de vânzare-cumpărare", status: "prezent" },
      { document: "Extras din RBI", status: "lipsește" },
      { document: "Buletin vânzător", status: "prezent" },
    ],
    calcule: { pret: `${d.step6Data.pretVanzare} ${d.step6Data.valuta}`, impozit: "", notar: "", altele: "" },
    pasi: "Obțineți declarația notarială de consimțământ al soțului.",
    dosarNotar: "Declarație de consimțământ al soțului — necesară înainte de notar.",
    temeiLegal: "Codul civil al RM — contract de vânzare-cumpărare",
  };
}
