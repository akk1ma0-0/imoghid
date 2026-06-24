"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { FlowTx } from "../types";
import type { ReportData } from "../report";
import { ReportModal } from "../ReportModal";

// Accesul la acest pas este garantat de logică doar pentru PRO — fără upsell aici.
export function Step7Report({ tx }: { tx: FlowTx }) {
  const { data: session } = useSession();
  const agentName = session?.user?.name ?? "";
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{ content: ReportData; docxUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/transactions/${tx.id}/report`);
        const d = await r.json();
        if (!cancelled && r.ok && d.report) {
          setSaved({ content: d.report.content as ReportData, docxUrl: d.report.docxUrl ?? null });
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tx.id]);

  return (
    <div className="asp-hero" style={{ textAlign: "left", padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Fișa obiectului</div>
      <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 20, lineHeight: 1.6 }}>
        Conține: verificarea actelor, semnale identificate, acordurile necesare, lista
        documentelor pentru notar, calculele impozitelor și cheltuielilor notariale.
      </div>

      {saved && (
        <div className="notice green" style={{ marginBottom: 14 }}>
          <div className="notice-dot" />
          <div>
            <b>Fișă salvată</b>
            {saved.docxUrl ? (
              <>
                {" · "}
                <a href={saved.docxUrl} target="_blank" rel="noopener noreferrer">descărcați .docx</a>
              </>
            ) : null}
          </div>
        </div>
      )}

      <button className="asp-btn" onClick={() => setOpen(true)} disabled={loading}>
        ⤓ Fișa obiectului
      </button>

      {open && (
        <ReportModal
          tx={tx}
          agentName={agentName}
          savedContent={saved?.content ?? null}
          onClose={() => setOpen(false)}
          onSaved={(content, docxUrl) => setSaved({ content, docxUrl })}
        />
      )}
    </div>
  );
}
