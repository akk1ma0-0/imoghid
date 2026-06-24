"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Platform = "instagram" | "tiktok" | "facebook" | "999";
type Language = "ro" | "ru";
type ReelFrame = { timing: string; scene: string; voiceover: string };
type CreatorResult =
  | { kind: "social"; slides: string[] | null; reels: ReelFrame[] | null; post: string; hashtags: string }
  | { kind: "anunt"; ro: string; ru: string };
type TxItem = { id: string; address: string | null; dealType: string; createdAt: string };
type Photo = { file: File; url: string };

const PLATFORMS: { code: Platform; label: string }[] = [
  { code: "instagram", label: "Instagram" },
  { code: "tiktok", label: "TikTok" },
  { code: "facebook", label: "Facebook" },
  { code: "999", label: "999.md" },
];
// Темы контента (минимум 7) + произвольная тема через поле ввода.
const TOPICS: string[] = [
  "Analiză prețuri sector",
  "Top greșeli la cumpărarea unui apartament",
  "Cum verifici un apartament înainte de cumpărare",
  "Ce documente sunt necesare la vânzare",
  "Legea 40/2026 — ce se schimbă pentru agenți",
  "De ce să lucrezi cu un agent imobiliar",
  "Sfat săptămânal pentru cumpărători",
];
const CUSTOM_TOPIC = "__custom__";
const SLIDE_GRADIENTS: [string, string][] = [
  ["#1d4ed8", "#3b82f6"],
  ["#15803d", "#22c55e"],
  ["#9a3412", "#f97316"],
  ["#4c1d95", "#7c3aed"],
  ["#991b1b", "#ef4444"],
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function dealLabel(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
// Рисует изображение «cover» в прямоугольник w×h.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / ir;
    dx = 0;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  let y = cy - ((lines.length - 1) * lineHeight) / 2;
  for (const l of lines) {
    ctx.fillText(l, cx, y);
    y += lineHeight;
  }
}

export default function CreatorPage() {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [language, setLanguage] = useState<Language>("ro");
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");

  const [objectDesc, setObjectDesc] = useState("");
  const [objectPrice, setObjectPrice] = useState("");
  const [objectNotes, setObjectNotes] = useState("");

  const [txList, setTxList] = useState<TxItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const importRef = useRef<HTMLDivElement>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<CreatorResult | null>(null);
  const [slidePreviews, setSlidePreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedPostId, setSavedPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const is999 = platform === "999";

  useEffect(() => {
    document.title = "Creator Hub · ImoGhid";
  }, []);

  // ?platform=999 (из «Generare anunț» в Instrumente).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("platform") === "999") {
      setPlatform("999");
    }
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Galerie: salvare / ștergere generare curentă ──
  async function saveToGallery() {
    if (!result || savedPostId) return;
    const payload =
      result.kind === "social"
        ? {
            platform,
            topic: effectiveTopic || "—",
            language,
            slides: result.slides,
            reels: result.reels,
            post: result.post,
            hashtags: result.hashtags,
          }
        : {
            platform: "999",
            topic: objectDesc.trim() || "Anunț 999",
            language,
            slides: null,
            reels: null,
            post: result.ro,
            hashtags: result.ru,
          };
    try {
      const r = await fetch("/api/creator/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setSavedPostId(d.id);
      showToast("Salvat în galerie ✓");
    } catch {
      showToast("Eroare la salvare.");
    }
  }

  async function deleteCurrent() {
    if (!result) return;
    if (!confirm("Ștergeți această generare?")) return;
    try {
      if (savedPostId) await fetch(`/api/creator/posts/${savedPostId}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setSavedPostId(null);
    setResult(null);
    setEditing(false);
    showToast("Șters.");
  }

  const loadTransactions = useCallback(async () => {
    try {
      const r = await fetch("/api/transactions");
      if (!r.ok) return;
      const d = await r.json();
      setTxList(d.transactions ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (importOpen && txList.length === 0) loadTransactions();
  }, [importOpen, txList.length, loadTransactions]);

  useEffect(() => {
    if (!importOpen) return;
    function onDown(e: MouseEvent) {
      if (importRef.current && !importRef.current.contains(e.target as Node)) setImportOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [importOpen]);

  function choosePlatform(code: Platform) {
    setPlatform(code);
    setResult(null);
    setEditing(false);
    setSavedPostId(null);
  }

  async function selectTransaction(id: string) {
    setImportOpen(false);
    try {
      const r = await fetch(`/api/transactions/${id}`);
      if (!r.ok) return;
      const d = await r.json();
      const t = d.transaction;
      const parts = [t.address, t.objectType, t.suprafata ? `${t.suprafata} m²` : null].filter(Boolean);
      setObjectDesc(parts.join(", "));
      const price = t.calculation?.sellPrice ?? t.valoare ?? "";
      setObjectPrice(price ? String(price) : "");
    } catch {
      /* поля остаются для ручного заполнения */
    }
  }

  // ── Фото (только в памяти браузера) ──
  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type));
    setPhotos((prev) => {
      const space = Math.max(0, 5 - prev.length);
      const toAdd = arr.slice(0, space).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
      return [...prev, ...toAdd];
    });
  }
  function removePhoto(i: number) {
    setPhotos((prev) => {
      const url = prev[i]?.url;
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, j) => j !== i);
    });
  }

  const effectiveTopic = topic === CUSTOM_TOPIC ? customTopic.trim() : topic;

  async function generate() {
    setError(null);
    setEditing(false);
    setSavedPostId(null);
    if (is999 && !objectDesc.trim()) {
      setError("Completați descrierea obiectului sau importați din dosar.");
      return;
    }
    if (!is999 && topic === CUSTOM_TOPIC && !customTopic.trim()) {
      setError("Scrieți tema dvs. în câmpul liber.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/tools/creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          language,
          topic: is999 ? "object" : effectiveTopic,
          objectData: is999
            ? { description: objectDesc, price: objectPrice, notes: objectNotes }
            : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Eroare la generare.");
      setResult(d.result as CreatorResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la generare.");
    } finally {
      setBusy(false);
    }
  }

  function copyValue(text: string, which: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  // ── Рендер слайда на Canvas (фон: фото cover + полупрозрачный градиент, иначе градиент) ──
  const renderSlideCanvas = useCallback(async (text: string, i: number, total: number): Promise<HTMLCanvasElement | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const [c1, c2] = SLIDE_GRADIENTS[i % SLIDE_GRADIENTS.length];
    const gradient = () => {
      const g = ctx.createLinearGradient(0, 0, 1080, 1080);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      return g;
    };
    const photo = photos.length ? photos[Math.min(i, photos.length - 1)] : null;
    if (photo) {
      try {
        const img = await loadImage(photo.url);
        drawCover(ctx, img, 1080, 1080);
        // полупрозрачный градиент поверх фото — для читаемости белого текста
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = gradient();
        ctx.fillRect(0, 0, 1080, 1080);
        ctx.restore();
      } catch {
        ctx.fillStyle = gradient();
        ctx.fillRect(0, 0, 1080, 1080);
      }
    } else {
      ctx.fillStyle = gradient();
      ctx.fillRect(0, 0, 1080, 1080);
    }
    // Текст (serif, белый, по центру).
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 58px Georgia, 'Times New Roman', serif";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    wrapText(ctx, text, 540, 540, 880, 78);
    ctx.shadowBlur = 0;
    ctx.font = "500 30px Georgia, serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText("ImoGhid", 64, 1016);
    ctx.textAlign = "right";
    ctx.fillText(`${i + 1}/${total}`, 1016, 1016);
    return canvas;
  }, [photos]);

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadSlide(i: number) {
    if (!result || result.kind !== "social" || !result.slides) return;
    const canvas = await renderSlideCanvas(result.slides[i], i, result.slides.length);
    if (!canvas) return;
    canvas.toBlob((b) => b && triggerDownload(b, `imoghid-slide-${i + 1}.png`), "image/png");
  }
  function downloadAll() {
    if (!result || result.kind !== "social" || !result.slides) return;
    result.slides.forEach((_, i) => setTimeout(() => downloadSlide(i), i * 400));
  }

  // Превью каруселя: рендерим каждый слайд в dataURL для показа на странице.
  useEffect(() => {
    let cancelled = false;
    async function build() {
      if (!result || result.kind !== "social" || !result.slides) {
        setSlidePreviews([]);
        return;
      }
      const slides = result.slides;
      const urls: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        const canvas = await renderSlideCanvas(slides[i], i, slides.length);
        urls.push(canvas ? canvas.toDataURL("image/png") : "");
      }
      if (!cancelled) setSlidePreviews(urls);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [result, renderSlideCanvas]);

  // ── Редактирование результата ──
  const setSlide = (i: number, val: string) =>
    setResult((r) =>
      r && r.kind === "social" && r.slides ? { ...r, slides: r.slides.map((s, j) => (j === i ? val : s)) } : r,
    );
  const setReel = (i: number, field: keyof ReelFrame, val: string) =>
    setResult((r) =>
      r && r.kind === "social" && r.reels
        ? { ...r, reels: r.reels.map((f, j) => (j === i ? { ...f, [field]: val } : f)) }
        : r,
    );

  return (
    <div className="ig-page">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="crumb">Instrumente</div>
          <h1>Creator Hub</h1>
        </div>
        <Link href="/app/creator/gallery" className="btn">🗂 Galerie</Link>
      </div>
      <p className="sub">
        Generați postări, carusele, scenarii Reels și anunțuri 999.md pentru rețelele sociale.
      </p>

      <div className="creator-grid">
        {/* ── LEFT ── */}
        <div>
          <div className="card">
            <div className="card-hd"><b>Platformă</b></div>
            <div className="card-bd">
              <div className="type-grid">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    className={`type-btn${platform === p.code ? " on" : ""}`}
                    onClick={() => choosePlatform(p.code)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!is999 && (
            <div className="card">
              <div className="card-hd"><b>Limbă</b></div>
              <div className="card-bd">
                <div className="lang-tabs">
                  <button className={`lang-tab${language === "ro" ? " on" : ""}`} onClick={() => setLanguage("ro")}>RO</button>
                  <button className={`lang-tab${language === "ru" ? " on" : ""}`} onClick={() => setLanguage("ru")}>RU</button>
                </div>
              </div>
            </div>
          )}

          {!is999 && (
            <div className="card">
              <div className="card-hd"><b>Tema conținutului</b></div>
              <div className="card-bd">
                <div className="filters" style={{ marginBottom: 0 }}>
                  {TOPICS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`chip${topic === t ? " on" : ""}`}
                      onClick={() => setTopic(t)}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`chip${topic === CUSTOM_TOPIC ? " on" : ""}`}
                    onClick={() => setTopic(CUSTOM_TOPIC)}
                  >
                    ✏️ Temă proprie...
                  </button>
                </div>
                {topic === CUSTOM_TOPIC && (
                  <div className="field-group" style={{ marginTop: 12 }}>
                    <input
                      type="text"
                      placeholder="Scrieți tema dvs. aici..."
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {is999 && (
            <div className="card">
              <div className="card-hd"><b>Datele obiectului</b>{is999 && <span className="badge b-gray" style={{ marginLeft: "auto" }}>anunț RO + RU</span>}</div>
              <div className="card-bd">
                <div className="import-wrap" ref={importRef} style={{ position: "relative", marginBottom: 12 }}>
                  <button className="btn" type="button" onClick={() => setImportOpen((v) => !v)}>
                    Importă din dosar →
                  </button>
                  {importOpen && (
                    <div className="import-menu">
                      {txList.length === 0 ? (
                        <div className="import-empty">Nu aveți tranzacții.</div>
                      ) : (
                        txList.map((t) => (
                          <button key={t.id} type="button" className="import-item" onClick={() => selectTransaction(t.id)}>
                            <span className="import-addr">{t.address || "Fără adresă"}</span>
                            <span className="import-meta">{dealLabel(t.dealType)} · {fmtDate(t.createdAt)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="field-group">
                  <label>Descriere obiect</label>
                  <input type="text" placeholder="adresă, tip, suprafață" value={objectDesc} onChange={(e) => setObjectDesc(e.target.value)} />
                </div>
                <div className="field-group">
                  <label>Preț</label>
                  <input type="text" placeholder="Valoarea în lei" value={objectPrice} onChange={(e) => setObjectPrice(e.target.value)} />
                </div>
                <div className="field-group">
                  <label>Particularități <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span></label>
                  <textarea rows={3} placeholder="bloc nou, reparație, vedere..." value={objectNotes} onChange={(e) => setObjectNotes(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {platform === "instagram" && (
            <div className="card">
              <div className="card-hd">
                <b>Fotografii</b>
                <span className="badge b-gray" style={{ marginLeft: "auto" }}>{photos.length}/5</span>
              </div>
              <div className="card-bd">
                <div
                  className="drop"
                  style={{ padding: "16px 14px" }}
                  onClick={() => photoInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addPhotos(e.dataTransfer.files);
                  }}
                >
                  <div className="drop-big" style={{ fontSize: 13 }}>Încărcați fotografii</div>
                  <div className="drop-sub">JPG · PNG · WEBP — max 5. Fără foto → fundal gradient.</div>
                  <button className="drop-btn" type="button">+ selectați</button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpg,image/jpeg,image/webp"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      addPhotos(e.target.files || []);
                      e.target.value = "";
                    }}
                  />
                </div>
                {photos.length > 0 && (
                  <div className="cr-thumbs">
                    {photos.map((p, i) => (
                      <div className="cr-thumb" key={i}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={`foto ${i + 1}`} />
                        <span className="cr-thumb-n">{i + 1}</span>
                        <button type="button" className="cr-thumb-x" onClick={() => removePhoto(i)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="notice red" style={{ marginBottom: 12 }}>
              <div className="notice-dot" />
              <div><b>{error}</b></div>
            </div>
          )}

          <button className="btn solid" style={{ width: "100%", justifyContent: "center" }} onClick={generate} disabled={busy}>
            {busy ? "Se generează…" : "✦ Generează"}
          </button>
        </div>

        {/* ── RIGHT: preview ── */}
        <div>
          <div className="card" style={{ minHeight: 200 }}>
            <div className="card-hd">
              <b>Previzualizare — {PLATFORMS.find((p) => p.code === platform)?.label}</b>
              {result && <span className="badge b-purple" style={{ marginLeft: "auto" }}>generat</span>}
            </div>
            <div className="card-bd">
              {!result ? (
                <p style={{ fontSize: 13, color: "var(--ink3)" }}>
                  Configurați opțiunile în stânga și apăsați „✦ Generează”.
                </p>
              ) : result.kind === "anunt" ? (
                <>
                  <div className="cr-section">Anunț 999.md — RO</div>
                  {editing ? (
                    <textarea className="ai-output" style={{ width: "100%" }} rows={6} value={result.ro} onChange={(e) => setResult((r) => (r && r.kind === "anunt" ? { ...r, ro: e.target.value } : r))} />
                  ) : (
                    <div className="ai-output">{result.ro}</div>
                  )}
                  <div className="cr-section" style={{ marginTop: 12 }}>Anunț 999.md — RU</div>
                  {editing ? (
                    <textarea className="ai-output" style={{ width: "100%" }} rows={6} value={result.ru} onChange={(e) => setResult((r) => (r && r.kind === "anunt" ? { ...r, ru: e.target.value } : r))} />
                  ) : (
                    <div className="ai-output">{result.ru}</div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                    <button className="btn" onClick={() => copyValue(result.ro, "ro")}>{copied === "ro" ? "✓ Copiat" : "Copiați RO"}</button>
                    <button className="btn" onClick={() => copyValue(result.ru, "ru")}>{copied === "ru" ? "✓ Copiat" : "Copiați RU"}</button>
                    <button className="btn" onClick={() => setEditing((v) => !v)}>{editing ? "✓ Gata" : "Redactați"}</button>
                    {savedPostId ? (
                      <button className="btn" disabled>✓ În galerie</button>
                    ) : (
                      <button className="btn" onClick={saveToGallery}>În galerie</button>
                    )}
                    <button className="btn" onClick={deleteCurrent}>Șterge</button>
                  </div>
                </>
              ) : (
                <>
                  {platform === "instagram" && result.slides && (
                    <div style={{ marginBottom: 14 }}>
                      <div className="cr-section">Carusel · {result.slides.length} slide-uri{photos.length > 0 ? ` · ${photos.length} foto fundal` : ""}</div>
                      {/* Vizualizare slide-uri ca imagini (320×320) — scroll orizontal */}
                      <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 0 10px" }}>
                        {result.slides.map((s, i) => (
                          <div key={i} style={{ flex: "0 0 auto", width: 320 }}>
                            <div style={{ position: "relative", width: 320, height: 320, borderRadius: 10, overflow: "hidden", background: "var(--bg2, #f1f5f9)", border: "1px solid var(--line, #e2e8f0)" }}>
                              {slidePreviews[i] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={slidePreviews[i]} alt={`slide ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              ) : (
                                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--ink4)" }}>
                                  Se randează…
                                </div>
                              )}
                              <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>{i + 1}</span>
                            </div>
                            {editing && (
                              <textarea rows={2} style={{ width: "100%", marginTop: 6, fontSize: 12 }} value={s} onChange={(e) => setSlide(i, e.target.value)} />
                            )}
                            <button type="button" className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 6, fontSize: 12 }} title="Descarcă slide-ul (PNG)" onClick={() => downloadSlide(i)}>
                              ↓ Descarcă
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {platform === "tiktok" && result.reels && (
                    <div style={{ marginBottom: 14 }}>
                      <div className="cr-section">Scenariu Reels · {result.reels.length} cadre</div>
                      {result.reels.map((f, i) => (
                        <div className="cr-reel" key={i}>
                          <div className="cr-reel-t">{editing ? <input value={f.timing} onChange={(e) => setReel(i, "timing", e.target.value)} /> : f.timing}</div>
                          <div className="cr-reel-b">
                            <div className="cr-reel-scene"><b>În cadru:</b> {editing ? <input value={f.scene} onChange={(e) => setReel(i, "scene", e.target.value)} /> : f.scene}</div>
                            <div className="cr-reel-vo"><b>Voiceover:</b> {editing ? <input value={f.voiceover} onChange={(e) => setReel(i, "voiceover", e.target.value)} /> : f.voiceover}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="cr-section">{platform === "instagram" ? "Caption" : platform === "tiktok" ? "Descriere" : "Text postare"}</div>
                  {editing ? (
                    <textarea className="ai-output" style={{ width: "100%" }} rows={5} value={result.post} onChange={(e) => setResult((r) => (r && r.kind === "social" ? { ...r, post: e.target.value } : r))} />
                  ) : (
                    <div className="ai-output">{result.post}</div>
                  )}
                  <div className="cr-section" style={{ marginTop: 12 }}>Hashtags</div>
                  {editing ? (
                    <textarea className="ai-output" style={{ width: "100%" }} rows={2} value={result.hashtags} onChange={(e) => setResult((r) => (r && r.kind === "social" ? { ...r, hashtags: e.target.value } : r))} />
                  ) : (
                    <div className="ai-output" style={{ color: "var(--blue)" }}>{result.hashtags}</div>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                    <button className="btn" onClick={() => copyValue([result.post, result.hashtags].filter(Boolean).join("\n\n"), "post")}>
                      {copied === "post" ? "✓ Copiat" : "Copiați textul"}
                    </button>
                    {platform === "instagram" && result.slides && (
                      <button className="btn" onClick={downloadAll}>Descărcați toate</button>
                    )}
                    <button className="btn" onClick={() => setEditing((v) => !v)}>{editing ? "✓ Gata" : "Redactați"}</button>
                    {savedPostId ? (
                      <button className="btn" disabled>✓ În galerie</button>
                    ) : (
                      <button className="btn" onClick={saveToGallery}>În galerie</button>
                    )}
                    <button className="btn" onClick={deleteCurrent}>Șterge</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--ink, #1c2630)",
            color: "#fff",
            padding: "9px 18px",
            borderRadius: 8,
            fontSize: 13,
            zIndex: 200,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
