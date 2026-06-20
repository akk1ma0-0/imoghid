import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

// Системный промпт генератора анонсов кешируется в памяти при старте (не читаем файл на каждый запрос).
const ANUNT_SYSTEM_PROMPT: string = (() => {
  try {
    return readFileSync(
      path.join(process.cwd(), "docs", "templates", "anunt-generator-prompt.md"),
      "utf8",
    );
  } catch {
    return "Ești asistent de redactare anunțuri imobiliare. Returnează doar textul anunțului + hashtag-uri, fără preambul/markdown, în limba cerută.";
  }
})();

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (block && "text" in block) return block.text.trim();
  throw new Error("Răspuns Claude fără conținut text.");
}

// ── 1. Generator de anunțuri ──
function stubAnunt(input: string, lang: "ro" | "ru"): string {
  const tags = "#imobil #vanzare #chisinau";
  return lang === "ru"
    ? `Продаётся объект: ${input}. Связь с агентом для деталей и просмотра.\n${tags}`
    : `Spre vânzare: ${input}. Contactați agentul pentru detalii și vizionare.\n${tags}`;
}

export async function generateAnunt(input: string, lang: "ro" | "ru"): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[tools] fără ANTHROPIC_API_KEY — anunț stub.");
    return stubAnunt(input, lang);
  }
  try {
    // В запрос идёт ТОЛЬКО кешированный системный промпт + тезисы пользователя.
    return await callClaude(
      ANUNT_SYSTEM_PROMPT,
      `Teze: ${input}\nLimba de output: ${lang === "ru" ? "rusă (ru)" : "română (ro)"}`,
      700,
    );
  } catch (err) {
    console.error("[tools] eroare generare anunț, stub:", err);
    return stubAnunt(input, lang);
  }
}

// Completarea șabloanelor (Acte/Contracte) NU mai folosește Claude: se face determinist
// prin docxtemplater (lib/templates.ts), cu date din formular/tranzacție. Vezi /api/tools/generate-doc.
