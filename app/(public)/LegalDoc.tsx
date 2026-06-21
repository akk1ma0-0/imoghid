import type { ReactNode } from "react";
import Link from "next/link";

import { LEGAL_DOCS } from "@/lib/legal-content";

// Перекрёстные ссылки между публичными документами.
const CROSS = [
  { href: "/despre", label: "Despre ImoGhid" },
  { href: "/termeni", label: "Termeni și Condiții" },
  { href: "/confidentialitate", label: "Politică de confidențialitate" },
  { href: "/faq", label: "Întrebări frecvente" },
];

// Рендер одного юридического документа из статического контента (lib/legal-content.ts).
export function LegalDoc({ docKey }: { docKey: keyof typeof LEGAL_DOCS }) {
  const doc = LEGAL_DOCS[docKey];

  // Сборка блоков: последовательные li объединяются в один <ul>.
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  let k = 0;
  const flush = () => {
    if (list.length) {
      const items = list;
      nodes.push(
        <ul key={`ul-${k++}`}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const b of doc.blocks) {
    if (b.t === "li") {
      list.push(b.text);
      continue;
    }
    flush();
    if (b.t === "h2") nodes.push(<h2 key={k++}>{b.text}</h2>);
    else if (b.t === "h3") nodes.push(<h3 key={k++}>{b.text}</h3>);
    else if (b.t === "q") nodes.push(<p className="legal-q" key={k++}>{b.text}</p>);
    else nodes.push(<p key={k++}>{b.text}</p>);
  }
  flush();

  return (
    <div className="legal-page">
      <div className="legal-wrap">
        <div className="legal-backbar">
          <Link href="/app" className="legal-back">
            ← Înapoi la ImoGhid
          </Link>
        </div>

        <header className="legal-head">
          <div className="legal-brand">
            <div className="legal-logo">IG</div>
            <div>
              <span className="legal-mark">BiSeeTh</span>
              <span className="legal-dot">·</span>
              <span className="legal-app">ImoGhid</span>
            </div>
          </div>
          <p className="legal-letter">ImoGhid — Documente legale și informative</p>
          <p className="legal-meta">
            BiSeeTh este o marcă comercială administrată de „BlackSpace Tech” SRL, IDNO
            1024600065567 · Dezvoltată în colaborare cu Liudmila Popovscaia, expert în drept
            imobiliar.
          </p>
        </header>

        <h1>{doc.title}</h1>
        {nodes}

        <footer className="legal-foot">
          {CROSS.map((c, i) => (
            <span key={c.href}>
              {i > 0 && <span className="sep">·</span>}
              <Link href={c.href}>{c.label}</Link>
            </span>
          ))}
        </footer>
      </div>
    </div>
  );
}
