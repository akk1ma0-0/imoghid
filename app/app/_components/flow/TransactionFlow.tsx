"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { StepNav } from "./StepNav";
import { RightRail } from "./RightRail";
import { STEP_META, NEXT_CARD } from "./constants";
import type { FlowTx } from "./types";
import { Step1Date } from "./steps/Step1Date";
import { Step2Upload } from "./steps/Step2Upload";
import { Step3Verify } from "./steps/Step3Verify";
import { Step4Owners } from "./steps/Step4Owners";
import { Step5Checklist } from "./steps/Step5Checklist";
import { Step6Pay } from "./steps/Step6Pay";
import { Step7Report } from "./steps/Step7Report";
import { Step8Asp } from "./steps/Step8Asp";

export function TransactionFlow({
  transactionId,
  initialStep,
  prefill,
}: {
  transactionId?: string;
  initialStep: number;
  prefill?: {
    address?: string;
    objectType?: string;
    cadastralNo?: string;
    fromCadastru?: boolean;
    suprafata?: string;
    destinatie?: string;
    valoare?: string;
  };
}) {
  const router = useRouter();
  const [tx, setTx] = useState<FlowTx | null>(null);
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(!!transactionId);

  const reload = useCallback(async () => {
    if (!transactionId) return;
    const r = await fetch(`/api/transactions/${transactionId}`);
    if (r.ok) {
      const d = await r.json();
      setTx(d.transaction as FlowTx);
    }
  }, [transactionId]);

  useEffect(() => {
    if (transactionId) reload().finally(() => setLoading(false));
  }, [transactionId, reload]);

  const goStep = useCallback(
    (n: number) => {
      setStep(n);
      if (transactionId) {
        window.history.replaceState(null, "", `/app/transactions/${transactionId}?step=${n}`);
        fetch(`/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentStep: n }),
        }).then(() => reload());
      }
    },
    [transactionId, reload],
  );

  const meta = STEP_META[step] ?? STEP_META[1];

  function renderStep() {
    if (step === 1) {
      return (
        <Step1Date
          tx={tx}
          prefill={prefill}
          onNext={(id) =>
            tx ? goStep(2) : router.replace(`/app/transactions/${id}?step=2`)
          }
        />
      );
    }
    if (!tx) return null;
    switch (step) {
      case 2:
        return <Step2Upload tx={tx} reload={reload} onAnalyzed={() => goStep(3)} />;
      case 3:
        return <Step3Verify tx={tx} />;
      case 4:
        return <Step4Owners tx={tx} reload={reload} />;
      case 5:
        return <Step5Checklist tx={tx} reload={reload} />;
      case 6:
        return <Step6Pay tx={tx} reload={reload} onNext={() => goStep(7)} />;
      case 7:
        return <Step7Report tx={tx} />;
      case 8:
        return <Step8Asp />;
      default:
        return null;
    }
  }

  return (
    <div className="shell">
      <StepNav step={step} onGo={goStep} enabled={!!transactionId} />
      <main className="ig-main">
        <div className="crumb">{meta.crumb}</div>
        <h1>{meta.h1}</h1>
        <p className="sub">{meta.sub}</p>
        <div className="prog">
          <div className="prog-fill" style={{ width: `${meta.progress}%` }} />
        </div>
        {loading ? (
          <p style={{ color: "var(--ink3)", fontSize: 13 }}>Se încarcă…</p>
        ) : (
          renderStep()
        )}

        {/* Навигация шагов под контентом (как левое меню). Только для существующей транзакции. */}
        {transactionId && (
          <div
            style={{ display: "flex", justifyContent: "center", gap: 12, margin: "28px 0 10px" }}
          >
            <button className="btn" disabled={step <= 1} onClick={() => goStep(step - 1)}>
              ← Pasul anterior
            </button>
            {NEXT_CARD[step]?.n ? (
              <button className="btn solid" onClick={() => goStep(NEXT_CARD[step]!.n!)}>
                → Pasul {NEXT_CARD[step]!.n}
              </button>
            ) : null}
          </div>
        )}
      </main>
      <RightRail />
    </div>
  );
}
