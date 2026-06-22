// АВТОГЕНЕРАЦИЯ lib/info-content.ts из docs/*.docx (контент дропдауна «Informații utile»).
// Парсинг через pizzip (mammoth/docx в проекте нет). Перегенерировать при изменении .docx.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PizZip = require("pizzip");
import { readFileSync, writeFileSync } from "node:fs";

const files = {
  lege: "docs/Lege_40_2026.docx",
  statut: "docs/ImoGhid_Statutul_agentului.docx",
  acte: "docs/ImoGhid_Acte_notariale.docx",
};
const dec = (s) => s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
function extract(p){
  const xml = new PizZip(readFileSync(p)).file("word/document.xml").asText();
  const out=[];
  for(const para of xml.split(/<w:p[ >]/).slice(1)){
    const style=(para.match(/w:pStyle w:val="([^"]+)"/)||[,""])[1];
    const isList=/<w:numPr>/.test(para);
    const runs=[...para.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g)].map(m=>m[1]);
    let anyText=false,allBold=true;
    for(const r of runs){const tx=[...r.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>dec(m[1])).join("");if(tx.trim()){anyText=true;if(!/<w:b\/>|<w:b /.test(r))allBold=false;}}
    const text=[...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>dec(m[1])).join("").trim();
    if(!text)continue;
    let t="p";
    if(/heading1|titlu1|^title$/i.test(style))t="h1";
    else if(/heading2|titlu2/i.test(style))t="h2";
    else if(/heading3|titlu3/i.test(style))t="h3";
    else if(isList)t="li";
    else if(anyText&&allBold)t="q";
    out.push({t,text});
  }
  return out;
}
const data={};
for(const [k,p] of Object.entries(files)){
  const items=extract(p);
  const blocks=items.slice(1); // первый блок = дублирующий заголовок (показан в шапке секции)
  if(blocks[0]&&blocks[0].t==="p"&&/^Text(e)? pentru modulul/i.test(blocks[0].text)) blocks.shift();
  data[k]=blocks.map(b=>({t:b.t==="q"?"h2":b.t,text:b.text})); // bold-абзацы → подзаголовки
}
const header=`// АВТОГЕНЕРАЦИЯ из docs/*.docx (scripts/gen-info-content.mjs). Не редактировать вручную.
// Контент дропдауна «Informații utile» в Topbar (Lege 40/2026, Statut agent, Acte notariale).

export type InfoBlock = { t: "h1" | "h2" | "h3" | "p" | "li"; text: string };

export const INFO_DOCS: Record<"lege" | "statut" | "acte", InfoBlock[]> =
`;
writeFileSync("lib/info-content.ts", header+JSON.stringify(data,null,2)+";\n");
console.log("Wrote lib/info-content.ts");
for(const k of Object.keys(data)) console.log(`  ${k}: ${data[k].length} blocks`);
