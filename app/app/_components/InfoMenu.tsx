"use client";

import { useEffect, useRef, useState } from "react";
import { INFO_DOCS, type InfoBlock } from "@/lib/info-content";

// Дропдаун «Informații utile» в Topbar. Дизайн/логика — docs/imoghid-v4.html:
// toggle меню, аккордеон (одновременно открыта одна секция), клик вне — закрывает.
const SECTIONS = [
  { key: "lege", icon: "📋", title: "Legea nr. 40/2026 privind activitatea agenților imobiliari" },
  { key: "statut", icon: "👤", title: "Statutul agentului imobiliar" },
  { key: "acte", icon: "⚖️", title: "Acte notariale în imobiliare" },
] as const;

function Blocks({ blocks }: { blocks: InfoBlock[] }) {
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];
  let k = 0;
  const flush = () => {
    if (list.length) {
      const items = list;
      nodes.push(
        <ul className="info-ul" key={`u${k++}`}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const b of blocks) {
    if (b.t === "li") {
      list.push(b.text);
      continue;
    }
    flush();
    if (b.t === "h1" || b.t === "h2" || b.t === "h3") {
      nodes.push(<p className="info-h" key={k++}>{b.text}</p>);
    } else {
      nodes.push(<p className="info-p" key={k++}>{b.text}</p>);
    }
  }
  flush();
  return <>{nodes}</>;
}

export function InfoMenu() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Клик вне дропдауна — закрывает меню.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn info-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="info-btn-ic" aria-hidden>
          ℹ
        </span>
        <span className="info-btn-lb">Informații utile</span>
        <span style={{ fontSize: 10 }} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="info-menu">
          <div className="info-menu-hd">Informații utile pentru agenți</div>
          {SECTIONS.map((s) => {
            const isOpen = section === s.key;
            return (
              <div className="info-acc" key={s.key}>
                <button
                  type="button"
                  className="info-acc-hd"
                  aria-expanded={isOpen}
                  onClick={() => setSection(isOpen ? null : s.key)}
                >
                  <span>
                    {s.icon} {s.title}
                  </span>
                  <span className={`info-acc-ic${isOpen ? " open" : ""}`} aria-hidden>
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <div className="info-acc-bd">
                    <Blocks blocks={INFO_DOCS[s.key]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
