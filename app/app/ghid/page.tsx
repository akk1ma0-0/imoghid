"use client";

import { useEffect, useState } from "react";
import { useDemo } from "@/app/contexts/DemoContext";
import { DEMO_TRANSACTION, DEMO_STEPS, DEMO_CALC, buildDemoReportData } from "@/lib/demo-data";
import { buildReportDocx } from "@/app/app/_components/flow/report";
import { downloadFile, preopenTab } from "@/lib/download-file";

const D = DEMO_TRANSACTION;

function todayRo(): string {
  const dt = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

function DemoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-group">
      <label>{label}</label>
      <input className="demo-field" value={value} readOnly />
    </div>
  );
}

export default function DemoGhidPage() {
  const { current } = useDemo();
  const step = current?.ghidStep ?? 1;

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Симуляция анализа Claude на шаге 3 (2 сек, без реального вызова API).
  useEffect(() => {
    if (step === 3 && !analyzed && !analyzing) {
      setAnalyzing(true);
      const t = setTimeout(() => {
        setAnalyzing(false);
        setAnalyzed(true);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [step, analyzed, analyzing]);

  async function downloadDemoReport() {
    setGenerating(true);
    const tab = preopenTab(); // синхронно, до await (iOS)
    try {
      const blob = await buildReportDocx(buildDemoReportData(todayRo()));
      downloadFile(blob, "Fisa_Obiectului_DEMO.docx", tab);
    } catch {
      tab?.close();
    } finally {
      setGenerating(false);
    }
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="card">
            <div className="card-hd"><b>Obiect</b><span className="badge b-blue" style={{ marginLeft: "auto" }}>date din Verificare imobil</span></div>
            <div className="card-bd">
              <DemoField label="Adresa obiectului" value={D.step1Data.address} />
              <div className="field-row">
                <DemoField label="Număr cadastral" value={D.step1Data.cadastralNumber} />
                <DemoField label="Tip obiect" value="Apartament" />
              </div>
              <div className="field-row-3">
                <DemoField label="Suprafață (m²)" value={D.step1Data.suprafata} />
                <DemoField label="Destinație" value={D.step1Data.destinatie} />
                <DemoField label="Valoare evaluare" value={`${D.step1Data.valoare} lei`} />
              </div>
              <div className="field-group" style={{ marginTop: 8 }}>
                <label>Tip tranzacție</label>
                <div className="type-grid">
                  <div className="type-btn on" style={{ pointerEvents: "none" }}>Vânzare-cumpărare</div>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="card">
            <div className="card-hd"><b>Fișiere</b><span className="badge b-blue" style={{ marginLeft: "auto" }}>simulate</span></div>
            <div className="card-bd">
              {D.step2Data.documents.map((doc) => (
                <div className="doc-row" key={doc.name}>
                  <div className="doc-ic">PDF</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="doc-name">{doc.name}</div>
                    <div className="doc-meta">Încărcat (demo)</div>
                  </div>
                  <span className="badge b-green">încărcat</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return analyzing ? (
          <div className="card"><div className="card-bd" style={{ textAlign: "center", padding: 28 }}>
            <div className="cad-spin" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, color: "var(--ink3)" }}>Gheorghii analizează documentele…</p>
          </div></div>
        ) : analyzed ? (
          <div>
            <div className="card">
              <div className="card-hd"><b>Date extrase</b></div>
              <div className="card-bd">
                <div className="field-row">
                  <DemoField label="Proprietar actual" value={D.step3Data.ownerName} />
                  <DemoField label="Cotă" value={D.step3Data.ownerCota} />
                </div>
                <DemoField label="Temei al dreptului" value={D.step3Data.ownershipBasis} />
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><b>Comparație cu datele din cadastru</b></div>
              <div className="card-bd">
                <div className="field-row">
                  <DemoField label="Suprafață (doc / cadastru)" value={`${D.step3Data.objectComparison.suprafataDoc} / ${D.step3Data.objectComparison.suprafataCadastru} ✓`} />
                  <DemoField label="Destinație (doc / cadastru)" value={`${D.step3Data.objectComparison.destinatieDoc} / ${D.step3Data.objectComparison.destinatieCadastru} ✓`} />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><b>Semnale identificate</b></div>
              <div className="card-bd">
                {D.step3Data.flags.map((f, i) => (
                  <div key={i} className={`notice ${f.severity === "GREEN" ? "green" : "amber"}`} style={{ marginBottom: 10 }}>
                    <div className="notice-dot" />
                    <div>
                      <b>{f.titleRo}</b>
                      <p style={{ margin: "3px 0 0" }}>{f.descriptionRo}</p>
                      {"legalRef" in f && f.legalRef && <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--ink3)" }}>{f.legalRef}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null;
      case 4:
        return (
          <div className="card">
            <div className="card-hd"><b>Coproprietari</b><span className="badge b-amber" style={{ marginLeft: "auto" }}>proprietate comună</span></div>
            <div className="card-bd">
              {D.step4Data.owners.map((o) => (
                <div key={o.name} className="doc-row">
                  <div className="doc-ic">👤</div>
                  <div><div className="doc-name">{o.name}</div><div className="doc-meta">Cotă: {o.cota}</div></div>
                  <span className="badge b-green">actualizat</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-hd" style={{ background: "var(--blue-bg)" }}><b style={{ color: "var(--blue)" }}>Partea 1 — Vânzător</b></div>
              <div className="card-bd">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{D.step5Data.party1Name}</div>
                {["Act de proprietate", "Extras din RBI", "Buletin de identitate", "Declarație consimțământ soț"].map((doc) => (
                  <div key={doc} style={{ fontSize: 12.5, color: "var(--ink2)", padding: "3px 0" }}>• {doc}</div>
                ))}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-hd" style={{ background: "var(--purple-bg)" }}><b style={{ color: "var(--purple)" }}>Partea 2 — Cumpărător</b></div>
              <div className="card-bd">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{D.step5Data.party2Name}</div>
                {["Buletin de identitate", "Dovada surselor de finanțare"].map((doc) => (
                  <div key={doc} style={{ fontSize: 12.5, color: "var(--ink2)", padding: "3px 0" }}>• {doc}</div>
                ))}
              </div>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="card">
            <div className="card-hd"><b>Plăți la tranzacție</b><span className="badge b-blue" style={{ marginLeft: "auto" }}>estimativ</span></div>
            <div className="card-bd">
              <div className="field-row">
                <DemoField label="Preț vânzare" value={DEMO_CALC.pret} />
                <DemoField label="Impozit vânzător" value={DEMO_CALC.impozitVanzator} />
              </div>
              <div className="field-row">
                <DemoField label="Onorariu notarial" value={DEMO_CALC.onorariuNotar} />
                <DemoField label="Taxă de înregistrare" value={DEMO_CALC.taxaInregistrare} />
              </div>
              <div className="notice blue" style={{ marginTop: 4 }}><div className="notice-dot" /><div><b>Total cheltuieli: {DEMO_CALC.total}</b><p style={{ margin: "2px 0 0" }}>Sumele sunt orientative.</p></div></div>
            </div>
          </div>
        );
      case 7:
        return (
          <div className="asp-hero" style={{ textAlign: "left", padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Fișa obiectului</div>
            <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 20, lineHeight: 1.6 }}>
              Raport complet al tranzacției — rezultatele verificării, semnale, calcule, dosar pentru notar.
            </div>
            <button className="asp-btn" onClick={downloadDemoReport} disabled={generating}>
              {generating ? "Se generează…" : "⤓ Fișa obiectului (demo .docx)"}
            </button>
          </div>
        );
      case 8:
        return (
          <div className="notice green">
            <div className="notice-dot" />
            <div>
              <b>Dosarul este complet!</b>
              <p style={{ margin: "4px 0 0" }}>În mod real, dosarul apare în „Obiectele mele”, unde puteți schimba statusul și genera fișa pentru notar.</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="shell">
      <nav className="lnav">
        <div className="nav-lbl">Ghidul tranzacției · Demo</div>
        {DEMO_STEPS.map((s) => {
          const cls = s.n === step ? "active" : s.n < step ? "done" : "";
          return (
            <div key={s.n} className={`step-item ${cls}`} style={{ cursor: "default" }}>
              <div className="step-num">{s.n}</div>
              <div className="step-txt"><b>{s.title}</b><small>{s.sub}</small></div>
              {s.n < 8 && <div className="step-line" />}
            </div>
          );
        })}
      </nav>

      <main className="ig-main">
        <div className="crumb">Pasul {step} / 8 · Mod Demo</div>
        <h1>{DEMO_STEPS[step - 1].title}</h1>
        <p className="sub">Tur interactiv cu date de test. Acțiunile nu afectează date reale.</p>
        <div className="prog"><div className="prog-fill" style={{ width: `${(step / 8) * 100}%` }} /></div>
        {renderStep()}
      </main>

      <aside className="rrail">
        <div className="rrail-body" data-open="true">
          <div className="rules-card">
            <div className="rules-hd"><b>Mod Demo</b><span>tur</span></div>
            <div className="rules-bd">
              <p>Urmați indicațiile din colțul din dreapta-jos pentru a parcurge cei 8 pași ai dosarului.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
