"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ReelFrame = { timing: string; scene: string; voiceover: string };
type Post = {
  id: string;
  platform: string;
  topic: string;
  language: string;
  slides: string[] | null;
  reels: ReelFrame[] | null;
  post: string | null;
  hashtags: string | null;
  imageUrls: string[];
  createdAt: string;
  expiresAt: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  "999": "999.md",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// «Se șterge în X zile Y ore» (или ore/minute если < 1 zi).
function countdown(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "Expiră acum";
  const zile = Math.floor(ms / 86_400_000);
  const ore = Math.floor((ms % 86_400_000) / 3_600_000);
  if (zile >= 1) return `Se șterge în ${zile} ${zile === 1 ? "zi" : "zile"} ${ore} ${ore === 1 ? "oră" : "ore"}`;
  const minute = Math.floor((ms % 3_600_000) / 60_000);
  return `Se șterge în ${ore} ${ore === 1 ? "oră" : "ore"} ${minute} min`;
}

export default function CreatorGalleryPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Galerie · Creator Hub";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/creator/posts");
      const d = await r.json();
      if (r.ok) setPosts(d.posts ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Тик каждую минуту: обновляем таймеры (и скрываем истёкшие).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function remove(id: string) {
    if (!confirm("Ștergeți această generare din galerie?")) return;
    setPosts((p) => p.filter((x) => x.id !== id));
    try {
      await fetch(`/api/creator/posts/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  function copyValue(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const visible = posts.filter((p) => new Date(p.expiresAt).getTime() > now);

  return (
    <div className="ig-page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Link href="/app/creator" className="btn">← Înapoi</Link>
        <div className="crumb" style={{ margin: 0 }}>Creator Hub</div>
      </div>
      <h1>Galerie</h1>
      <p className="sub">
        Generările salvate se păstrează 14 zile, apoi se șterg automat.
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--ink3)" }}>Se încarcă…</p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="card-bd">
            <p style={{ fontSize: 13, color: "var(--ink3)" }}>
              Nicio generare salvată. Generați conținut și apăsați „În galerie”.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((p) => (
            <div className="card" key={p.id} style={{ marginBottom: 0 }}>
              <div className="card-hd">
                <span className="badge b-purple">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                <b style={{ fontWeight: 600 }}>{p.topic}</b>
                <span className="badge b-gray" style={{ marginLeft: "auto" }}>{fmtDate(p.createdAt)}</span>
              </div>
              <div className="card-bd">
                <div style={{ fontSize: 11.5, color: "var(--amber)", marginBottom: 10 }}>
                  ⏳ {countdown(p.expiresAt, now)}
                </div>

                {p.slides && p.slides.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="cr-section">Carusel · {p.slides.length} slide-uri</div>
                    <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--ink2)" }}>
                      {p.slides.map((s, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {p.reels && p.reels.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="cr-section">Scenariu Reels · {p.reels.length} cadre</div>
                    {p.reels.map((f, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 4 }}>
                        <b>{f.timing}</b> — {f.scene} · <i>{f.voiceover}</i>
                      </div>
                    ))}
                  </div>
                )}

                {p.post && (
                  <>
                    <div className="cr-section">{p.platform === "999" ? "Anunț (RO)" : "Text"}</div>
                    <div className="ai-output" style={{ whiteSpace: "pre-wrap" }}>{p.post}</div>
                  </>
                )}
                {p.hashtags && (
                  <>
                    <div className="cr-section" style={{ marginTop: 10 }}>
                      {p.platform === "999" ? "Anunț (RU)" : "Hashtags"}
                    </div>
                    <div className="ai-output" style={{ whiteSpace: "pre-wrap", color: p.platform === "999" ? undefined : "var(--blue)" }}>{p.hashtags}</div>
                  </>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <button
                    className="btn"
                    onClick={() => copyValue([p.post, p.hashtags].filter(Boolean).join("\n\n"), p.id)}
                  >
                    {copied === p.id ? "✓ Copiat" : "Copiați textul"}
                  </button>
                  <button className="btn" onClick={() => remove(p.id)}>Șterge</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
