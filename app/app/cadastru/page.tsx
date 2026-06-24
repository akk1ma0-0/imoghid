"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Предобработка скриншота для OCR (Canvas): 2x при ширине < 1500px, grayscale, бинаризация.
function preprocessImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const scale = img.width < 1500 ? 2 : 1;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = avg > 128 ? 255 : 0; // порог контраста
        data[i] = data[i + 1] = data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/png");
    };
    img.onerror = () => reject(new Error("image"));
    img.src = URL.createObjectURL(file);
  });
}

// Нормализация флага: «Existã/Există/…» → «Există», «Nu există» → «Nu există».
function normFlag(s: string): string {
  if (!s) return "Nu există";
  return /exist/i.test(s) && !/nu\s*exist/i.test(s) ? "Există" : "Nu există";
}

// Парсер кадастрального текста (вставка / OCR). Только client-side регулярки, без API.
function parseCadastralText(text: string) {
  const grab = (re: RegExp) => {
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  // Suprafața: число + единица (m.p./m²/ha/hectare). Возвращаем строку с нормализованной
  // единицей — гектары (ha) для участков, m² для квартир/помещений.
  const grabArea = (): string => {
    const m = text.match(/([\d.,]+)\s*(m\.?p\.?|m²|ha|hectare)/i);
    if (m) {
      const num = m[1].replace(/\s+/g, "").trim();
      const unit = /ha|hectare/i.test(m[2]) ? "ha" : "m²";
      return num ? `${num} ${unit}` : "";
    }
    // fallback: «Suprafața: 59.70» без явной единицы → m²
    const f = text.match(/suprafa[țt]a[:\s]+([\d\s.,]+)/i);
    if (f) {
      const num = f[1].replace(/\s+/g, "").trim();
      return num ? `${num} m²` : "";
    }
    return "";
  };
  // Valoare устойчиво к OCR-артефактам (мусор в начале строки, запятая вместо двоеточия,
  // искажённое «valoare»: «|. oarca estimată a bunului imobil, 382 252»). Ловим число в строке
  // с estimat/valoare/bunului imobil; fallback — любое число > 10000 рядом с «lei».
  const extractValoare = (): string => {
    const m = text.match(/(?:estimat|valoare|bunului\s+imobil)[^0-9]*([\d\s]+)(?:\s*lei)?/i);
    if (m) {
      const num = m[1].replace(/\s+/g, "");
      if (num) return num;
    }
    const f = text.match(/lei[:\s,|.]*([\d\s]{4,})/i);
    if (f) {
      const num = f[1].replace(/\s+/g, "");
      if (num && Number(num) > 10000) return num;
    }
    return "";
  };
  return {
    numarCadastral: grab(/numărul cadastral[:\s]+([0-9.]+)/i),
    adresa: grab(/adresa[:\s]+(.+)/i),
    destinatie: grab(/destinație[:\s]+(.+)/i),
    suprafata: grabArea(),
    valoare: extractValoare(),
    tipProprietate: grab(/tipul de proprietate[:\s]+(.+)/i),
    alteDrepturiReale: grab(/alte drepturi reale[:\s]+(.+)/i),
    notari: grab(/notări[:\s]+(.+)/i),
    interdictii: grab(/interdicții[:\s]+(.+)/i),
  };
}

type TraceStep = { s: "ok" | "run" | "wait"; title: string; val?: string; step?: string };
type CadRecord = {
  addr: string;
  supr: string;
  dest: string;
  val: string;
  prop: string;
  dr: string;
  not: string;
  int: string;
};
type Building = { bcad: string; addr: string; teren: string; apts: number[] };

// Флаг — только для чтения; значение приходит из парсера, пользователь его не меняет.
function FlagBox({ k, v, critical }: { k: string; v: string; critical?: boolean }) {
  const clear = v === "Nu există";
  // Nu există → зелёный; Există → красный для блокеров (Interdicții), жёлтый для остальных.
  const cls = clear ? "ok" : critical ? "bad" : "warn";
  return (
    <div className={`fl2-box ${cls}`}>
      <div className="fl2-k">{k}</div>
      <div className="fl2-v">{(clear ? "✓ " : "! ") + v}</div>
    </div>
  );
}

function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ink3)",
          marginBottom: 7,
        }}
      >
        Pașii verificării
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((t, i) => (
          <li className="cad-tr-item" key={i}>
            {t.s === "ok" ? (
              <span className="cad-tk ok">✓</span>
            ) : t.s === "run" ? (
              <span className="cad-tk run">
                <span className="cad-spin" />
              </span>
            ) : (
              <span className="cad-tk wait">{t.step || "!"}</span>
            )}
            <span>
              <b>{t.title}</b>
              {t.val && (
                <>
                  <br />
                  <span className="cad-tr-val">{t.val}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CadastruPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [trace, setTrace] = useState<TraceStep[] | null>(null);
  const [record, setRecord] = useState<{ cadastralNo: string; record: CadRecord } | null>(null);
  const [picker, setPicker] = useState<{ building: Building; note: string } | null>(null);
  const [fallback, setFallback] = useState<{ title: string; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState<{ addr: string; cad: string } | null>(null);

  // ── Ввод вручную (текст / скриншот OCR) ──
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTab, setManualTab] = useState<"text" | "image">("text");
  const [manualText, setManualText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [parseWarn, setParseWarn] = useState<string | null>(null);

  // Флаги (alte drepturi / notări / interdicții) — readonly, всегда из парсера сырого OCR-текста.
  // При любом ручном изменении поля пересчитываем их заново (для поиска raw нет — флаги из API).
  function recomputeFlags(rec: { cadastralNo: string; record: CadRecord }) {
    if (!ocrRawText) return rec;
    const p = parseCadastralText(ocrRawText);
    return {
      ...rec,
      record: {
        ...rec.record,
        dr: normFlag(p.alteDrepturiReale),
        not: normFlag(p.notari),
        int: normFlag(p.interdictii),
      },
    };
  }

  // Обновление одного поля редактируемой карточки (+ пересчёт readonly-флагов).
  function updateRec(field: keyof CadRecord, value: string) {
    setRecord((r) => (r ? recomputeFlags({ ...r, record: { ...r.record, [field]: value } }) : r));
  }

  // Заполняет карточку результата из распарсенного текста.
  function applyParsed(text: string): boolean {
    const p = parseCadastralText(text);
    if (!p.numarCadastral && !p.adresa) {
      setOcrError("Nu am putut extrage datele. Verificați formatul textului.");
      return false;
    }
    setTrace(null);
    setPicker(null);
    setFallback(null);
    setManualMode(true);

    // Предупреждение: подозрительно большая площадь для квартиры (вероятно артефакт OCR).
    // Предупреждение только для m² (для ha большие числа нормальны).
    const suprNum = parseFloat(p.suprafata.replace(",", "."));
    setParseWarn(
      p.suprafata.includes("m²") && Number.isFinite(suprNum) && suprNum > 500
        ? `Suprafața recunoscută (${p.suprafata}) pare neobișnuit de mare — verificați (posibil artefact OCR).`
        : null,
    );

    setRecord({
      cadastralNo: p.numarCadastral || "—",
      record: {
        addr: p.adresa || "—",
        supr: p.suprafata || "—",
        dest: p.destinatie || "—",
        val: p.valoare || "—",
        prop: p.tipProprietate || "—",
        dr: normFlag(p.alteDrepturiReale),
        not: normFlag(p.notari),
        int: normFlag(p.interdictii),
      },
    });
    setManualOpen(false);
    return true;
  }

  // OCR скриншота через Tesseract.js (язык 'ron'); динамический импорт — не грузим на старте.
  async function runOcr(file: File) {
    setOcrError(null);
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      // Предобработка (Canvas): апскейл + grayscale + бинаризация — заметно лучше для скриншотов.
      let input: Blob = file;
      try {
        input = await preprocessImage(file);
      } catch {
        input = file; // если предобработка не удалась — OCR исходника
      }
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(input, "ron", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 100));
        },
        tessedit_char_whitelist: "",
        preserve_interword_spaces: "1",
      } as Parameters<typeof Tesseract.recognize>[2]);
      setOcrRawText(data.text);
      if (!applyParsed(data.text)) {
        setOcrError("Nu am putut extrage datele din imagine. Verificați textul recunoscut mai jos.");
      }
    } catch {
      setOcrError("Eroare la recunoașterea imaginii.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function runLookup(rawQuery: string) {
    const raw = rawQuery.trim();
    if (!raw) return;
    setRecord(null);
    setPicker(null);
    setFallback(null);
    setManualMode(false);
    setOcrRawText(null);
    setParseWarn(null);
    setTrace([{ s: "run", title: "Recunosc datele introduse…" }]);

    let data: Record<string, unknown> | null = null;
    let ok = false;
    try {
      const r = await fetch("/api/cadastru/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: raw }),
      });
      ok = r.ok;
      data = await r.json();
    } catch {
      data = null;
    }

    await new Promise((res) => setTimeout(res, 450));

    if (!data) {
      setTrace(null);
      setFallback({ title: "Eroare de rețea", text: "Încercați din nou sau deschideți portalul manual." });
      return;
    }
    if (!ok || data.status === "fallback") {
      setTrace(null);
      setFallback({ title: String(data.title ?? "Adresa nu a fost găsită."), text: String(data.text ?? "") });
      return;
    }
    if (data.status === "record") {
      setTrace((data.trace as TraceStep[]) ?? null);
      setRecord({ cadastralNo: String(data.cadastralNo), record: data.record as CadRecord });
      return;
    }
    if (data.status === "picker") {
      setTrace((data.trace as TraceStep[]) ?? null);
      setPicker({ building: data.building as Building, note: String(data.note) });
    }
  }

  function pickApt(b: Building, n: number) {
    setPicker(null);
    runLookup(`${b.bcad}.${String(n).padStart(3, "0")}`);
  }

  function createDossier() {
    if (!record) return;
    const addr = record.record.addr.replace(" (demo)", "");
    setConfirmed({ addr, cad: record.cadastralNo });

    // ?target=object1 | object2 — какой объект Шага 1 заполнить (для Schimb).
    const target =
      new URLSearchParams(window.location.search).get("target") === "object2"
        ? "object2"
        : "object1";
    const obj = {
      address: addr,
      cadastralNo: record.cadastralNo,
      suprafata: record.record.supr ?? "",
      destinatie: record.record.dest ?? "",
      valoare: record.record.val ?? "",
    };
    // Данные верификации (флаги + поля) как substitut выписки RBI для шага 3.
    const verImobil = JSON.stringify({
      alteDrepturiReale: record.record.dr === "Există",
      notari: record.record.not === "Există",
      interdictii: record.record.int === "Există",
      suprafata: record.record.supr ?? "",
      destinatie: record.record.dest ?? "",
      valoare: record.record.val ?? "",
    });

    // Мержим в существующий черновик Шага 1, сохраняя данные другого объекта.
    let draft: Record<string, string | boolean> = {};
    try {
      draft = JSON.parse(sessionStorage.getItem("step1_draft") || "{}");
    } catch {
      draft = {};
    }
    draft.fromCadastru = true;
    if (target === "object2") {
      draft.dealType = "SCHIMB"; // второй объект имеет смысл только при обмене
      draft.address2 = obj.address;
      draft.cadastralNo2 = obj.cadastralNo;
      draft.suprafata2 = obj.suprafata;
      draft.destinatie2 = obj.destinatie;
      draft.valoare2 = obj.valoare;
      draft.verificareImobil2 = verImobil;
    } else {
      draft.address = obj.address;
      draft.cadastralNo = obj.cadastralNo;
      draft.suprafata = obj.suprafata;
      draft.destinatie = obj.destinatie;
      draft.valoare = obj.valoare;
      draft.verificareImobil = verImobil;
    }
    try {
      sessionStorage.setItem("step1_draft", JSON.stringify(draft));
    } catch {
      /* ignore */
    }
    setTimeout(() => router.push("/app/transactions/new"), 600);
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", minHeight: "calc(100vh - 52px)" }}>
      <main className="cad-main" style={{ maxWidth: 760, width: "100%" }}>
        {/* Banner: автоматический поиск ещё не подключён */}
        <div
          style={{
            background: "var(--blue-bg, #eef4ff)",
            borderLeft: "3px solid var(--blue, #2563eb)",
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 28,
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--blue, #2563eb)", marginBottom: 4 }}>
            Căutarea automată va fi disponibilă în curând!
          </div>
          <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.55 }}>
            Momentan, serviciul de verificare automată prin Cadastru este în curs de conectare.
            Pentru a introduce datele acum, vă rugăm să folosiți opțiunea „Verifică manual” și să
            urmați pașii simpli de mai jos.
          </div>
        </div>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 14px" }}>Verificați un obiect în cadastru</h1>
          <p className="sub" style={{ fontSize: 16, maxWidth: 560, margin: "0 auto" }}>
            Căutați obiectul după adresă sau numărul cadastral înainte de a-l lua în lucru. Datele
            confirmate aici se transferă direct în Ghidul tranzacției.
          </p>
        </div>

        {/* ── Căutare ── */}
        <div className="card">
          <div className="card-bd" style={{ padding: "28px 26px 30px" }}>
            <div className="field-group">
              <label style={{ fontSize: 14 }}>Adresă sau număr cadastral</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="Adresă sau număr cadastral"
                  style={{ flex: 1, height: 54, fontSize: 17, padding: "0 18px" }}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled
                  title="În curând"
                />
                <button
                  className="btn solid"
                  style={{ whiteSpace: "nowrap", height: 54, padding: "0 26px", fontSize: 15, opacity: 0.55, cursor: "not-allowed" }}
                  disabled
                  title="În curând"
                >
                  Căutați →
                </button>
                <button
                  className="btn"
                  type="button"
                  style={{ whiteSpace: "nowrap", height: 54, padding: "0 18px", fontSize: 14 }}
                  onClick={() => {
                    setOcrError(null);
                    setManualOpen(true);
                  }}
                >
                  ✎ Verifică manual
                </button>
              </div>
            </div>

            {trace && <Trace steps={trace} />}

            {picker && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 8 }}>{picker.note}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {picker.building.apts.map((n) => (
                    <span key={n} className="cad-apt-chip" onClick={() => pickApt(picker.building, n)}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {fallback && (
              <div className="notice red" style={{ marginTop: 16 }}>
                <div className="notice-dot" />
                <div>
                  <b>{fallback.title}</b>
                  <p style={{ margin: "4px 0 8px" }}>{fallback.text}</p>
                  <a className="btn" href="https://www.cadastru.md/ecadastru" target="_blank" rel="noopener noreferrer">
                    Deschideți e-Cadastru manual →
                  </a>
                </div>
              </div>
            )}

            {record && (
              <div style={{ marginTop: 18 }}>
                {manualMode && (
                  <div className="note note-warn" style={{ marginBottom: 12 }}>
                    Date introduse manual — nu sunt verificate oficial. Pentru certitudine juridică
                    comandați extrasul oficial din RBI.
                  </div>
                )}
                {parseWarn && (
                  <div className="notice amber" style={{ marginBottom: 12 }}>
                    <div className="notice-dot" />
                    <div>
                      <b>{parseWarn}</b>
                    </div>
                  </div>
                )}

                {/* Поля редактируемые — можно исправить ошибку OCR прямо здесь, до «Creați dosarul». */}
                <div className="field-group">
                  <label>Adresă</label>
                  <input type="text" value={record.record.addr} onChange={(e) => updateRec("addr", e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Număr cadastral</label>
                    <input
                      type="text"
                      value={record.cadastralNo}
                      onChange={(e) => setRecord((r) => (r ? recomputeFlags({ ...r, cadastralNo: e.target.value }) : r))}
                    />
                  </div>
                  <div className="field-group">
                    <label>Tip proprietate</label>
                    <input type="text" value={record.record.prop} onChange={(e) => updateRec("prop", e.target.value)} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Suprafață</label>
                    <input type="text" value={record.record.supr} onChange={(e) => updateRec("supr", e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label>Valoare (evaluare)</label>
                    <input type="text" value={record.record.val} onChange={(e) => updateRec("val", e.target.value)} />
                  </div>
                </div>
                <div className="field-group">
                  <label>Destinație</label>
                  <input type="text" value={record.record.dest} onChange={(e) => updateRec("dest", e.target.value)} />
                </div>

                <div className="cad-flags" style={{ marginTop: 4 }}>
                  <FlagBox k="Alte drepturi reale" v={record.record.dr} />
                  <FlagBox k="Notări" v={record.record.not} />
                  <FlagBox k="Interdicții" v={record.record.int} critical />
                </div>

                {ocrRawText && (
                  <details className="ocr-raw">
                    <summary>Text recunoscut (verificați manual)</summary>
                    <pre>{ocrRawText}</pre>
                  </details>
                )}

                <div className="note note-warn" style={{ marginTop: 10 }}>
                  Date orientative din Registrul bunurilor imobile. Persoanele cu date personale nu
                  sunt afișate la acest pas (Legea 133/2011).
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <a className="btn" href="https://www.cadastru.md/ecadastru" target="_blank" rel="noopener noreferrer">
                    Deschideți e-Cadastru ↗
                  </a>
                  <button className="btn solid" onClick={createDossier}>
                    Creați dosarul ↓
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Подтверждение → редирект */}
        {confirmed && (
          <div className="notice green" style={{ marginTop: 14 }}>
            <div className="notice-dot" />
            <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <b>{confirmed.addr}</b>
                <p style={{ margin: "2px 0 0", fontSize: 11.5 }}>
                  Număr cadastral {confirmed.cad} · confirmat → se deschide Ghidul tranzacției…
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Legendă semnale — горизонтально, без рамки */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
            marginTop: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
            Nu există — fără obstacole
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--amber)", flexShrink: 0 }} />
            Alte drepturi / Notări — necesită verificare
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
            Interdicții — blochează tranzacția
          </div>
        </div>

        {/* ── MODAL: introducere manuală (Text / OCR captură) ── */}
        {manualOpen && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && setManualOpen(false)}
          >
            <div className="modal-box" style={{ maxWidth: 560 }}>
              <div className="modal-hd">
                <h2>Verifică manual datele cadastrale</h2>
                <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setManualOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="modal-bd">
                <div className="lang-tabs" style={{ marginBottom: 12 }}>
                  <button
                    className={`lang-tab${manualTab === "text" ? " on" : ""}`}
                    onClick={() => {
                      setManualTab("text");
                      setOcrError(null);
                    }}
                  >
                    Text
                  </button>
                  <button
                    className={`lang-tab${manualTab === "image" ? " on" : ""}`}
                    onClick={() => {
                      setManualTab("image");
                      setOcrError(null);
                    }}
                  >
                    Captură de ecran
                  </button>
                </div>

                {ocrError && (
                  <div className="notice red" style={{ marginBottom: 10 }}>
                    <div className="notice-dot" />
                    <div>
                      <b>{ocrError}</b>
                    </div>
                  </div>
                )}

                {manualTab === "text" ? (
                  <>
                    {/* Numbered steps — instrucțiuni pas cu pas */}
                    <ol style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "grid", gap: 8 }}>
                      <li style={{ fontSize: 13, color: "var(--ink2)", display: "flex", alignItems: "center", gap: 8 }}>
                        <b style={{ color: "var(--ink)" }}>Pasul 1</b>
                        <a
                          className="btn solid"
                          href="https://www.cadastru.md/ecadastru/"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, padding: "5px 12px" }}
                        >
                          Accesați e-Cadastru ↗
                        </a>
                      </li>
                      <li style={{ fontSize: 13, color: "var(--ink2)" }}>
                        <b style={{ color: "var(--ink)" }}>Pasul 2</b> — Căutați obiectul manual
                      </li>
                      <li style={{ fontSize: 13, color: "var(--ink2)" }}>
                        <b style={{ color: "var(--ink)" }}>Pasul 3</b> — Copiați textul
                      </li>
                      <li style={{ fontSize: 13, color: "var(--ink2)" }}>
                        <b style={{ color: "var(--ink)" }}>Pasul 4</b> — Plasați text în chenar
                      </li>
                      <li style={{ fontSize: 13, color: "var(--ink2)" }}>
                        <b style={{ color: "var(--ink)" }}>Pasul 5</b> — Apăsați „Verifică manual”
                      </li>
                    </ol>
                    <textarea
                      className="doc-preview"
                      style={{ minHeight: 200 }}
                      placeholder={
                        "Numărul cadastral: ...\n" +
                        "Adresa: ...\n" +
                        "Destinație: ...\n" +
                        "Suprafața: ...\n" +
                        "Valoarea estimată a bunului imobil, lei: ...\n" +
                        "Tipul de proprietate: ...\n" +
                        "Alte drepturi reale: ...\n" +
                        "Notări: ...\n" +
                        "Interdicții: ..."
                      }
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                    />
                    <button
                      className="btn solid"
                      style={{ marginTop: 12 }}
                      disabled={!manualText.trim()}
                      onClick={() => {
                        setOcrRawText(null); // вставка текста — без блока OCR
                        applyParsed(manualText);
                      }}
                    >
                      Verifică manual
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="drop"
                      onClick={() => imgInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) runOcr(f);
                      }}
                    >
                      <div className="drop-big">Trageți imaginea aici</div>
                      <div className="drop-sub">PNG · JPG — captură din e-Cadastru</div>
                      <button className="drop-btn" type="button">
                        Selectați imaginea
                      </button>
                      <input
                        ref={imgInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) runOcr(f);
                        }}
                      />
                    </div>
                    {ocrBusy && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: "var(--ink3)", marginBottom: 6 }}>
                          Recunoaștere text… {ocrProgress}%
                        </div>
                        <div className="prog">
                          <div className="prog-fill" style={{ width: `${ocrProgress}%` }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
