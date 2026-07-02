// Конфигурация интерактивного тура «Mod Demo»: 5 этапов по реальным страницам.
import { DEMO_TRANSACTION } from "@/lib/demo-data";

export type DemoAction =
  | "auto-fill"
  | "show-result"
  | "show-flags"
  | "navigate-to-ghid"
  | "navigate-to-objects"
  | "navigate-to-acte"
  | "navigate-to-creator"
  | "end-demo";

export type DemoStep = {
  tooltip: string;
  highlight?: string; // CSS-селектор подсвечиваемого элемента
  action?: DemoAction;
  value?: string; // для auto-fill
  ghidStep?: number; // для этапа /app/ghid (1–8)
  simulate?: "upload" | "analysis" | "generation";
};

export type DemoStage = { stage: number; page: string; title: string; steps: DemoStep[] };

export const DEMO_FLOW: DemoStage[] = [
  {
    stage: 1,
    page: "/app/cadastru",
    title: "Verificare imobil",
    steps: [
      {
        highlight: "#search-input",
        tooltip:
          "Introduceți adresa obiectului pentru verificare. Sistemul caută automat în Registrul bunurilor imobile.",
        action: "auto-fill",
        value: DEMO_TRANSACTION.step1Data.address,
      },
      {
        highlight: "#verify-manual-btn",
        tooltip: 'Sau folosiți „Verifică manual" — introduceți datele direct din e-Cadastru.',
        action: "show-result",
      },
      {
        highlight: "#result-card",
        tooltip:
          "Rezultatul verificării: date cadastrale, suprafață, destinație, valoare estimată și starea grevărilor (drepturi reale, notări, interdicții).",
        action: "show-flags",
      },
      {
        highlight: "#creati-dosarul-btn",
        tooltip:
          "Datele obiectului se transferă automat în dosarul tranzacției. Continuați pentru a crea dosarul.",
        action: "navigate-to-ghid",
      },
    ],
  },
  {
    stage: 2,
    page: "/app/ghid",
    title: "Crează Dosar",
    steps: [
      {
        ghidStep: 1,
        tooltip:
          "Datele obiectului sunt pre-completate din Verificare imobil. Alegeți tipul tranzacției.",
      },
      {
        ghidStep: 2,
        tooltip: "Încărcați documentele tranzacției. Sistemul acceptă PDF și imagini scanate.",
        simulate: "upload",
      },
      {
        ghidStep: 3,
        tooltip:
          "Agentul Gheorghii analizează documentele și extrage automat proprietarul actual, cotele de proprietate și identifică riscurile juridice.",
        simulate: "analysis",
      },
      {
        ghidStep: 4,
        tooltip:
          "Coproprietarii și cotele extrase din documente. Sistemul detectează automat proprietatea comună.",
      },
      {
        ghidStep: 5,
        tooltip:
          "Lista actelor necesare pentru fiecare parte — vânzător și cumpărător, generate conform tipului tranzacției.",
      },
      {
        ghidStep: 6,
        tooltip:
          "Prețul tranzacției și calculele estimative: taxa de stat, onorariul notarial, impozitul pe creșterea de capital.",
      },
      {
        ghidStep: 7,
        tooltip:
          "Fișa completă a obiectului — raport pre-completat cu toate datele tranzacției, gata pentru notar.",
      },
      {
        ghidStep: 8,
        tooltip:
          "Dosarul este complet! Tranzacția apare acum în Obiectele mele unde urmăriți statusul.",
        action: "navigate-to-objects",
      },
    ],
  },
  {
    stage: 3,
    page: "/app/objects",
    title: "Obiectele mele",
    steps: [
      {
        highlight: "#objects-list",
        tooltip:
          "Toate tranzacțiile dvs. într-un singur loc. Filtrați după status: În lucru, În așteptare, Finisate, Arhivă.",
      },
      {
        highlight: "#status-buttons",
        tooltip:
          "Schimbați statusul tranzacției manual — când semnați contractul, marcați ca Finisat.",
      },
      {
        highlight: "#raport-btn",
        tooltip: "Descărcați sau modificați Fișa obiectului direct din card.",
      },
      {
        action: "navigate-to-acte",
        tooltip: "Continuăm turul — Actele mele →",
      },
    ],
  },
  {
    stage: 4,
    page: "/app/acte",
    title: "Actele mele",
    steps: [
      {
        highlight: "#templates-section",
        tooltip:
          "Șabloane de documente gata de utilizat: contracte, check-liste, fișe. Deschideți și editați direct în browser.",
      },
      {
        highlight: "#templates-section",
        tooltip:
          "Editorul vizual — modificați orice text, salvați versiunea personalizată și descărcați în Word sau PDF.",
      },
      {
        highlight: "#upload-section",
        tooltip:
          "Încărcați propriile documente — PDF, Word, Excel. Accesibile oricând din platformă.",
      },
      {
        action: "navigate-to-creator",
        tooltip: "Continuăm — Creator Hub →",
      },
    ],
  },
  {
    stage: 5,
    page: "/app/creator",
    title: "Creator Hub",
    steps: [
      {
        highlight: "#platform-selector",
        tooltip:
          "Alegeți platforma: Instagram, TikTok, Facebook sau 999.md. Conținut adaptat pentru fiecare.",
      },
      {
        highlight: "#topic-selector",
        tooltip:
          "7+ teme de conținut sau scrieți propria temă. Generați postări profesionale în română sau rusă.",
      },
      {
        highlight: "#generate-btn",
        tooltip:
          "Generați conținut cu un singur click. Textul, hashtagurile și structura caruselului — totul automat.",
        simulate: "generation",
      },
      {
        highlight: "#gallery-btn",
        tooltip:
          "Galeria păstrează postările generate 14 zile. Accesați oricând pentru a le descărca sau redistribui.",
      },
      {
        action: "end-demo",
        tooltip:
          "Ați parcurs toate funcțiile ImoGhid! Creați un cont gratuit și începeți prima tranzacție reală.",
      },
    ],
  },
];

export const TOTAL_STAGES = DEMO_FLOW.length;

export type FlatStep = DemoStep & {
  globalIndex: number;
  stage: number;
  stageTitle: string;
  page: string;
  stepInStage: number;
  stepsInStage: number;
};

export function flattenFlow(): FlatStep[] {
  const out: FlatStep[] = [];
  let gi = 0;
  for (const stage of DEMO_FLOW) {
    stage.steps.forEach((s, i) => {
      out.push({
        ...s,
        globalIndex: gi++,
        stage: stage.stage,
        stageTitle: stage.title,
        page: stage.page,
        stepInStage: i + 1,
        stepsInStage: stage.steps.length,
      });
    });
  }
  return out;
}
