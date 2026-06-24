import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

// Системный промпт кешируется в памяти модуля (не пересобирается на каждый запрос).
const SOCIAL_SYSTEM_PROMPT =
  "Ești un expert în marketing imobiliar pentru rețele sociale în Republica Moldova. " +
  "Generezi conținut profesionist și autentic pentru agenți imobiliari.\n" +
  "Textele sunt scurte, directe, fără clișee. Respectă legislația RM (Legea 40/2026).\n" +
  "Răspunzi DOAR cu JSON fără text suplimentar.";

export type Platform = "instagram" | "tiktok" | "facebook";
export type Language = "ro" | "ru";
// Тема — произвольный текст (одна из предложенных тем или своя).
export type Topic = string;
export type ReelFrame = { timing: string; scene: string; voiceover: string };
export type SocialResult = {
  slides: string[] | null;
  reels: ReelFrame[] | null;
  post: string;
  hashtags: string;
};
export type SocialRequest = {
  platform: Platform;
  language: Language;
  topic: Topic;
  objectData?: { description: string; price: string; notes: string };
};

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slides: { type: ["array", "null"], items: { type: "string" } },
    reels: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timing: { type: "string" },
          scene: { type: "string" },
          voiceover: { type: "string" },
        },
        required: ["timing", "scene", "voiceover"],
      },
    },
    post: { type: "string" },
    hashtags: { type: "string" },
  },
  required: ["slides", "reels", "post", "hashtags"],
} as const;

// ── Stub (без ключа / при ошибке) — чтобы поток работал и тестировался без реального вызова ──
function stubSocial(req: SocialRequest): SocialResult {
  const ro = req.language === "ro";
  const t = req.topic.trim() || req.objectData?.description || (ro ? "Conținut imobiliar" : "Контент о недвижимости");
  const hashtags = "#imobil #chisinau #imoghid #imobiliare #agentimobiliar";
  const post = ro
    ? `${t}. Detalii și consultanță — scrie-mi în privat. (text demo — fără cheie Claude)`
    : `${t}. Детали и консультация — пишите в личные сообщения. (демо-текст — без ключа Claude)`;

  if (req.platform === "instagram") {
    return {
      slides: [
        t,
        ro ? "Punctul 1 — context" : "Пункт 1 — контекст",
        ro ? "Punctul 2 — detalii" : "Пункт 2 — детали",
        ro ? "Punctul 3 — concluzie" : "Пункт 3 — вывод",
        ro ? "Contactează agentul →" : "Свяжитесь с агентом →",
      ],
      reels: null,
      post,
      hashtags,
    };
  }
  if (req.platform === "tiktok") {
    return {
      slides: null,
      reels: [
        { timing: "0-3s", scene: ro ? "Agent în cadru, hook" : "Агент в кадре, хук", voiceover: t },
        { timing: "3-8s", scene: ro ? "Detalii pe ecran" : "Детали на экране", voiceover: ro ? "Ce e important" : "Что важно" },
        { timing: "8-13s", scene: ro ? "Exemplu concret" : "Конкретный пример", voiceover: ro ? "Pe scurt" : "Кратко" },
        { timing: "13-15s", scene: ro ? "CTA" : "Призыв", voiceover: ro ? "Scrie-mi în privat" : "Пишите в личку" },
      ],
      post,
      hashtags,
    };
  }
  return { slides: null, reels: null, post, hashtags };
}

function normalize(parsed: Partial<SocialResult>): SocialResult {
  return {
    slides: Array.isArray(parsed.slides) ? parsed.slides.map(String) : null,
    reels: Array.isArray(parsed.reels)
      ? parsed.reels.map((r) => ({
          timing: String(r?.timing ?? ""),
          scene: String(r?.scene ?? ""),
          voiceover: String(r?.voiceover ?? ""),
        }))
      : null,
    post: String(parsed.post ?? ""),
    hashtags: String(parsed.hashtags ?? ""),
  };
}

export async function generateSocial(req: SocialRequest): Promise<SocialResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[creator] fără ANTHROPIC_API_KEY — conținut stub.");
    return stubSocial(req);
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const payload = {
      platform: req.platform,
      language: req.language,
      topic: req.topic,
      objectData: req.objectData,
    };
    const user =
      `Generează conținut pentru rețele sociale pe tema „${req.topic}”. Date:\n${JSON.stringify(payload)}\n\n` +
      `Reguli de format JSON:\n` +
      `- instagram: "slides" = EXACT 5 stringuri (texte de slide-uri), "reels" = null, "post" = caption.\n` +
      `- tiktok: "reels" = EXACT 4 obiecte {timing, scene, voiceover}, "slides" = null, "post" = descriere scurtă.\n` +
      `- facebook: "slides" = null, "reels" = null, "post" = textul postării.\n` +
      `- "hashtags" = șir cu hashtag-uri relevante.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SOCIAL_SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const block = response.content.find((b) => b.type === "text");
    if (block && "text" in block) {
      return normalize(JSON.parse(block.text) as Partial<SocialResult>);
    }
    throw new Error("Răspuns Claude fără conținut text.");
  } catch (err) {
    console.error("[creator] eroare generare, stub:", err);
    return stubSocial(req);
  }
}
