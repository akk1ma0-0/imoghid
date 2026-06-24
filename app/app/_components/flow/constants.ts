// Метаданные шагов, карта «Pasul următor» и ссылки на законы — из docs/imoghid-v4.html.

export type DealCode = "VANZARE_CUMPARARE" | "DONATIE" | "SCHIMB" | "ALT_TIP";

export const DEAL_TYPES: { code: DealCode; label: string }[] = [
  { code: "VANZARE_CUMPARARE", label: "Vânzare-cumpărare" },
  { code: "DONATIE", label: "Donație" },
  { code: "SCHIMB", label: "Schimb" },
  { code: "ALT_TIP", label: "Alt tip" },
];

export function dealLabel(code: string): string {
  return DEAL_TYPES.find((d) => d.code === code)?.label ?? "Vânzare-cumpărare";
}

export const STEP_NAV: { n: number; title: string; sub: string }[] = [
  { n: 1, title: "Date obiect", sub: "adresă, nr. cadastral" },
  { n: 2, title: "Încărcare", sub: "Acte aferente" },
  { n: 3, title: "Verificare acte", sub: "verificare și atenționări" },
  { n: 4, title: "Coproprietari", sub: "acorduri și drepturi" },
  { n: 5, title: "Lista pentru notar", sub: "dosar pentru notar" },
  { n: 6, title: "Plăți la tranzacție", sub: "impozit și cheltuieli" },
  { n: 7, title: "Fișa obiectului", sub: "raport complet" },
  { n: 8, title: "Programare ASP", sub: "înregistrare stat" },
];

export const STEP_META: Record<
  number,
  { crumb: string; h1: string; sub: string; progress: number }
> = {
  1: { crumb: "Pasul 1 / 8", h1: "Date obiect", sub: "Introduceți datele cunoscute. Documentele se încarcă la pasul următor.", progress: 14 },
  2: { crumb: "Pasul 2 / 8", h1: "Încărcați documentele", sub: "Trageți PDF-uri sau fotografii ale documentelor. Tipul fiecărui fișier este determinat automat.", progress: 25 },
  3: { crumb: "Pasul 3 / 8", h1: "Verificare acte", sub: "Platforma a comparat câmpurile între documente. Aspectele de mai jos necesită atenție.", progress: 43 },
  4: { crumb: "Pasul 4 / 8", h1: "Coproprietari și acorduri", sub: "Platforma a determinat componența proprietarilor și ce acorduri sunt necesare.", progress: 57 },
  5: { crumb: "Pasul 5 / 8", h1: "Lista de documente pentru notar", sub: "Lista depinde de tipul tranzacției și statutul părților. Platforma indică ce este disponibil și ce lipsește.", progress: 71 },
  6: { crumb: "Pasul 6 / 8", h1: "Plăți la tranzacție", sub: "Impozit pe creșterea de capital, cheltuieli notariale și calculator credit ipotecar. Sumele sunt orientative.", progress: 75 },
  7: { crumb: "Pasul 7 / 8", h1: "Fișa obiectului", sub: "Raportul complet al tranzacției — rezultatele verificării, semnale, calcule, dosar pentru notar.", progress: 87 },
  8: { crumb: "Pasul 8 / 8", h1: "Programare la ASP", sub: "Ultimul pas — programarea pentru înregistrarea de stat a tranzacției.", progress: 100 },
};

export type NextAct = { on: boolean; tx: string; s?: string };
export const NEXT_CARD: Record<number, { t: string; a: NextAct[]; n: number | null }> = {
  1: { t: "Încărcați documentele", a: [{ on: false, tx: "Completați datele obiectului" }, { on: false, tx: "Indicați tipul tranzacției" }], n: 2 },
  2: { t: "Treceți la verificare", a: [{ on: true, tx: "Date obiect completate" }, { on: false, tx: "Încărcați documente" }, { on: false, tx: "Lansați verificarea actelor", s: "pasul 3" }], n: 3 },
  3: { t: "Eliminați discrepanțele", a: [{ on: true, tx: "Acte verificate" }, { on: false, tx: "Actualizați datele neactualizate", s: "Cadastru" }, { on: false, tx: "Clarificați suprafața" }], n: 4 },
  4: { t: "Finalizați acordurile", a: [{ on: false, tx: "Obțineți acordul soțului/coproprietarilor" }, { on: false, tx: "Actualizați datele proprietarilor" }], n: 5 },
  5: { t: "2 documente lipsesc", a: [{ on: false, tx: "Atașați documentele lipsă" }, { on: false, tx: "Calculați impozitul", s: "pasul 6" }], n: 6 },
  6: { t: "Fișa obiectului", a: [{ on: false, tx: "Verificați calculele" }, { on: false, tx: "Descărcați fișa obiectului", s: "pasul 7" }], n: 7 },
  7: { t: "Programați-vă la ASP", a: [{ on: false, tx: "Descărcați fișa obiectului" }, { on: false, tx: "Programați-vă la ASP", s: "pasul 8" }], n: 8 },
  8: { t: "Traseu parcurs ✓", a: [{ on: true, tx: "Documente colectate" }, { on: true, tx: "Impozite calculate" }, { on: false, tx: "Înregistrați tranzacția la ASP" }], n: null },
};

export const LAW_TAGS: { label: string; url: string }[] = [
  { label: "Codul civil", url: "https://www.legis.md/cautare/getResults?doc_id=150498&lang=ro" },
  { label: "Codul fiscal", url: "https://www.legis.md/cautare/getResults?doc_id=154155&lang=ro" },
  { label: "Legea Cadastrului", url: "https://www.legis.md/cautare/getResults?doc_id=150224&lang=ro" },
  { label: "Codul familiei", url: "https://www.legis.md/cautare/getResults?doc_id=150708&lang=ro" },
  { label: "Activitatea agenților imobiliari", url: "https://www.legis.md/cautare/getResults?doc_id=154015&lang=ro" },
  { label: "Legea 271/2003", url: "https://www.legis.md/cautare/getResults?doc_id=148476&lang=ro" },
  { label: "Legea 133/2011", url: "https://www.legis.md/cautare/getResults?doc_id=144823&lang=ro" },
  { label: "Procedura notarială", url: "https://www.legis.md/cautare/getResults?doc_id=137680&lang=ro" },
  { label: "Legea freelancerilor", url: "https://www.legis.md/cautare/getResults?doc_id=150415&lang=ro" },
];
