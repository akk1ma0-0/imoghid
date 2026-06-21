import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PizZip = require("pizzip");
import { readFileSync, writeFileSync } from "node:fs";

const files = {
  despre: { path: "docs/Despre ImoGhid.docx", title: "Despre ImoGhid" },
  faq: { path: "docs/Întrebări frecvente.docx", title: "Întrebări frecvente" },
  confidentialitate: { path: "docs/Politică de confidențialitate.docx", title: "Politică de confidențialitate" },
  termeni: { path: "docs/Termeni și Condiții.docx", title: "Termeni și Condiții" },
};
const decode = (s) => s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");

function extract(path) {
  const zip = new PizZip(readFileSync(path));
  const xml = zip.file("word/document.xml").asText();
  const paras = xml.split(/<w:p[ >]/).slice(1);
  const out = [];
  for (const p of paras) {
    const style = (p.match(/w:pStyle w:val="([^"]+)"/) || [,""])[1];
    const isList = /<w:numPr>/.test(p);
    // runs with bold
    const runs = [...p.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
    let anyText = false, allBold = true;
    for (const r of runs) {
      const tx = [...r.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m)=>decode(m[1])).join("");
      if (tx.trim()) { anyText = true; if (!/<w:b\/>|<w:b /.test(r)) allBold = false; }
    }
    const text = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m)=>decode(m[1])).join("").trim();
    if (!text) continue;
    let t = "p";
    if (/heading1|titlu1|^title$/i.test(style)) t = "h1";
    else if (/heading2|titlu2/i.test(style)) t = "h2";
    else if (/heading3|titlu3/i.test(style)) t = "h3";
    else if (isList) t = "li";
    else if (anyText && allBold) t = "q"; // bold paragraph → sub-heading / FAQ question
    out.push({ t, text });
  }
  return out;
}

const data = {};
for (const [key, { path, title }] of Object.entries(files)) {
  const items = extract(path);
  // Letterhead (BiSeeTh / subBrand / trademark / collaboration) всегда идёт ДО H1.
  // Берём тело строго после первого H1; сам H1 (заголовок) рендерим отдельно.
  const h1idx = items.findIndex((it) => it.t === "h1");
  const body = h1idx >= 0 ? items.slice(h1idx + 1) : items;
  data[key] = { title, blocks: body };
}

const header =
`// АВТОГЕНЕРАЦИЯ из docs/*.docx (скрипт scripts/gen-legal-content.mjs). Не редактировать вручную —
// при изменении документов перегенерировать. Статический контент для публичных
// страниц /despre /faq /confidentialitate /termeni (без runtime-парсинга .docx).

export type LegalBlock = { t: "h2" | "h3" | "q" | "p" | "li"; text: string };
export type LegalDoc = { title: string; blocks: LegalBlock[] };

export const LEGAL_DOCS: Record<"despre" | "faq" | "confidentialitate" | "termeni", LegalDoc> =
`;
writeFileSync("lib/legal-content.ts", header + JSON.stringify(data, null, 2) + ";\n");
console.log("Wrote lib/legal-content.ts");
for (const k of Object.keys(data)) console.log(`  ${k}: ${data[k].blocks.length} blocks`);
