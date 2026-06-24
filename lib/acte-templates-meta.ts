// Метаданные шаблонных документов «Actele mele» — БЕЗ серверных импортов (fs/mammoth),
// чтобы можно было использовать в клиентских компонентах (карточки на /app/acte).
export type ActeTemplateMeta = {
  slug: string;
  title: string;
  subtitle: string;
  type: "docx" | "xlsx";
};

export const ACTE_TEMPLATES_META: ActeTemplateMeta[] = [
  {
    slug: "registrul-tranzactiilor",
    title: "Registrul tranzacțiilor",
    subtitle: "Registru pentru evidența tranzacțiilor imobiliare",
    type: "xlsx",
  },
  {
    slug: "check-list-acte",
    title: "Check-list acte",
    subtitle: "Listă de verificare a actelor pentru tranzacție",
    type: "docx",
  },
  {
    slug: "tipuri-acte-imobil",
    title: "Tipuri de acte ale imobilului",
    subtitle: "Tipurile de acte de proprietate pentru imobil",
    type: "xlsx",
  },
  {
    slug: "contract-hub-coworking",
    title: "Contract Hub coworking",
    subtitle: "Contract de coworking (Hub) — RO",
    type: "docx",
  },
  {
    slug: "contract-colaborare-agent",
    title: "Contract de colaborare agent–agenție",
    subtitle: "Acord de colaborare între agent și agenție — RO",
    type: "docx",
  },
];
