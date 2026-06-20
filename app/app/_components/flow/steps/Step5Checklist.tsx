import { useEffect, useState } from "react";
import type { FlowTx, FlowChecklistItem } from "../types";

const PARTY_LABEL: Record<string, string> = {
  VANZATOR: "Partea 1",
  CUMPARATOR: "Partea 2",
};

// Подписи под пунктами (без слов «încărcat»/«lipsește»).
const CHK_HINT: Record<string, string> = {
  act_de_drept: "Document de drept",
  extras_registru: "Actualizat",
  acord_sot: "Obligatoriu (vezi pasul 4)",
  certificat_privatizare: "După caz",
  hotarare_fondatori: "Persoană juridică",
  procura: "După caz",
  dovada_provenientei: "Confirmarea provenienței banilor",
};

export function Step5Checklist({
  tx,
  reload,
}: {
  tx: FlowTx;
  reload: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Автогенерация при первом входе, если список пуст.
  useEffect(() => {
    if (tx.notarChecklist.length === 0 && !generating) {
      setGenerating(true);
      fetch(`/api/transactions/${tx.id}/checklist`, { method: "POST" })
        .then(() => reload())
        .finally(() => setGenerating(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id]);

  async function toggle(item: FlowChecklistItem) {
    setBusyId(item.id);
    await fetch(`/api/transactions/${tx.id}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isUploaded: !item.isUploaded }),
    });
    await reload();
    setBusyId(null);
  }

  const groups: Record<string, FlowChecklistItem[]> = {};
  for (const it of tx.notarChecklist) {
    (groups[it.party] ??= []).push(it);
  }

  if (generating && tx.notarChecklist.length === 0) {
    return <p style={{ color: "var(--ink3)", fontSize: 13 }}>Se generează lista…</p>;
  }

  return (
    <div>
      {Object.entries(groups).map(([party, items]) => {
        const missing = items.filter((i) => i.isRequired && !i.isUploaded).length;
        return (
          <div className="card" key={party}>
            <div className="card-hd">
              <b>{PARTY_LABEL[party] ?? party}</b>
              {missing > 0 && (
                <span className="badge b-red" style={{ marginLeft: "auto" }}>
                  {missing} lipsesc
                </span>
              )}
            </div>
            <div className="card-bd">
              {items.map((item) => (
                <div className="chk-row" key={item.id}>
                  <div
                    className={`chk-box${
                      item.isUploaded ? " on" : item.isRequired ? " miss" : ""
                    }`}
                    onClick={() => busyId !== item.id && toggle(item)}
                  />
                  <div className="chk-txt">
                    <b>{item.labelRo}</b>
                    {CHK_HINT[item.documentKey] && <small>{CHK_HINT[item.documentKey]}</small>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
