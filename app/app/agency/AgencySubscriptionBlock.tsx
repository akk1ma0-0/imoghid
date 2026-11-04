"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { prorateTopup, seatsAmount, type AgencySubscriptionView } from "@/lib/agency-subscription-rules";
import { agencySeatsConsentText } from "@/lib/recurring-consent";

// Блок «Abonament agenție» на /app/agency — только для агентства с подпиской CyberSource
// (автопродление). Агентства VictoriaBank видят прежнюю форму докупки.
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const seatsWord = (n: number) => (n === 1 ? "1 loc" : `${n} locuri`);

export function AgencySubscriptionBlock({
  sub,
  seatsConsentVersion,
  cardUpdated,
}: {
  sub: AgencySubscriptionView;
  seatsConsentVersion: string;
  cardUpdated: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(cardUpdated ? "Cardul a fost actualizat." : null);
  const [addSeats, setAddSeats] = useState(1);
  const [addAgreed, setAddAgreed] = useState(false);
  const [reduceTo, setReduceTo] = useState(Math.max(sub.minReduceTo, sub.seats - 1));
  const [reduceAgreed, setReduceAgreed] = useState(false);
  const [restoreAgreed, setRestoreAgreed] = useState(false);
  const [panel, setPanel] = useState<"none" | "add" | "reduce">("none");

  const cur = sub.currency;
  const nowEstimate = prorateTopup({
    seatsToAdd: addSeats,
    pricePerSeatMdl: sub.pricePerSeat,
    periodStart: new Date(sub.periodStart),
    periodEnd: new Date(sub.paidUntil),
    now: new Date(),
  });
  const monthlyAfterAdd = seatsAmount(sub.seats + addSeats, sub.pricePerSeat);
  const monthlyAfterReduce = seatsAmount(reduceTo, sub.pricePerSeat);
  const fromDate = fmtDate(sub.paidUntil);

  async function call(url: string, method: string, body?: unknown, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string; status?: string };
      if (!r.ok && r.status !== 202) throw new Error(d.error ?? d.message ?? "Eroare.");
      if (d.message) setInfo(d.message);
      setPanel("none");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  const statusBadge =
    sub.status === "PAST_DUE" ? (
      <span className="badge b-red">Plată restantă</span>
    ) : sub.status === "CANCELED" ? (
      <span className="badge b-gray">Anulat</span>
    ) : (
      <span className="badge b-green">Activ</span>
    );

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-hd" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <b>Abonament agenție</b>
        {statusBadge}
      </div>
      <div className="card-bd" style={{ padding: "16px 22px", fontSize: 13.5, lineHeight: 1.7 }}>
        <div>
          <b>{seatsWord(sub.seats)}</b> × {sub.pricePerSeat} {cur} = <b>{sub.amount} {cur} / lună</b>
        </div>
        <div style={{ color: "var(--ink2)" }}>Plătit până la: {fmtDate(sub.paidUntil)}</div>
        {sub.status === "CANCELED" ? (
          <div style={{ color: "var(--ink2)" }}>
            Nu vor mai avea loc plăți. Dumneavoastră și colegii păstrați accesul până la {fmtDate(sub.paidUntil)}.
          </div>
        ) : (
          sub.nextChargeAt && <div style={{ color: "var(--ink2)" }}>Următoarea plată: {fmtDate(sub.nextChargeAt)}</div>
        )}
        <div style={{ color: "var(--ink2)" }}>
          Card: {sub.card ? `${sub.card.brand ?? "Card"} •••• ${sub.card.last4 ?? ""}` : "nu este salvat"}
        </div>

        {sub.status === "PAST_DUE" && (
          <div className="notice amber" style={{ marginTop: 10 }}>
            <div className="notice-dot" />
            <div>
              <b>Plata lunară nu a reușit.</b> Dumneavoastră și colegii păstrați accesul până la {fmtDate(sub.accessUntil)}.
              Actualizați cardul, apoi apăsați „Plătește acum”.
            </div>
          </div>
        )}

        {sub.pendingReduction && (
          <div className="notice blue" style={{ marginTop: 10 }}>
            <div className="notice-dot" />
            <div>
              <b>
                De la {fmtDate(sub.pendingReduction.from)}: {seatsWord(sub.pendingReduction.seats)}, {sub.pendingReduction.amount} {cur} / lună.
              </b>
              {sub.canCancelReduction && (
                <div style={{ marginTop: 6 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={restoreAgreed} onChange={(e) => setRestoreAgreed(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>{agencySeatsConsentText(sub.amount, cur, sub.seats, fmtDate(sub.pendingReduction.from))}</span>
                  </label>
                  <button
                    className="btn"
                    style={{ marginTop: 6 }}
                    disabled={busy || !restoreAgreed}
                    onClick={() => call("/api/agency/subscription/seats", "DELETE", { agreedToRecurring: true, consentVersion: seatsConsentVersion })}
                  >
                    Anulează reducerea
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="notice red" style={{ marginTop: 10 }}>
            <div className="notice-dot" />
            <div><b>{error}</b></div>
          </div>
        )}
        {info && !error && (
          <div className="notice green" style={{ marginTop: 10 }}>
            <div className="notice-dot" />
            <div><b>{info}</b></div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {sub.canTopup && (
            <button className="btn solid" disabled={busy} onClick={() => setPanel(panel === "add" ? "none" : "add")}>
              Adaugă locuri
            </button>
          )}
          {sub.canReduce && (
            <button className="btn" disabled={busy} onClick={() => setPanel(panel === "reduce" ? "none" : "reduce")}>
              Reduce locurile
            </button>
          )}
          {sub.canChangeCard && (
            <a className="btn" href="/app/agency/card">Schimbă cardul</a>
          )}
          {sub.canPayNow && (
            <button className="btn solid" disabled={busy} onClick={() => call("/api/agency/subscription/pay-now", "POST")}>
              Plătește acum
            </button>
          )}
          {sub.canCancel && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                call(
                  "/api/agency/subscription/cancel",
                  "POST",
                  undefined,
                  `Anulați abonamentul agenției? Plățile se opresc, iar dumneavoastră și colegii păstrați accesul până la ${fmtDate(sub.paidUntil)}. Suma plătită nu se returnează.`,
                )
              }
            >
              Anulează abonamentul
            </button>
          )}
          {sub.canResume && (
            <button className="btn solid" disabled={busy} onClick={() => call("/api/agency/subscription/resume", "POST")}>
              Reia abonamentul
            </button>
          )}
        </div>

        {panel === "add" && sub.canTopup && (
          <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--line, #eef0f2)", borderRadius: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Câte locuri adăugați?</label>
            <input
              type="number"
              min={1}
              value={addSeats}
              onChange={(e) => setAddSeats(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              style={{ width: 90, height: 38, padding: "0 10px" }}
            />
            <div style={{ fontSize: 13, color: "var(--ink2)", margin: "10px 0" }}>
              Acum plătiți aproximativ <b>{nowEstimate} {cur}</b> — doar pentru zilele rămase până la {fromDate}.
              <br />
              Apoi: <b>{monthlyAfterAdd} {cur} / lună</b> pentru {seatsWord(sub.seats + addSeats)}.
              <br />
              <span style={{ color: "var(--ink3)" }}>Suma exactă o vedeți pe pagina următoare, înainte de plată. Locurile noi sunt disponibile imediat.</span>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={addAgreed} onChange={(e) => setAddAgreed(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Sunt de acord cu{" "}
                <a href="/termeni" target="_blank" rel="noopener noreferrer">Termenii de plată și Politica de returnare</a>.
              </span>
            </label>
            <form method="POST" action="/api/payments/start">
              <input type="hidden" name="purpose" value="AGENCY_SEATS" />
              <input type="hidden" name="seats" value={addSeats} />
              <input type="hidden" name="agreedToTerms" value={addAgreed ? "true" : "false"} />
              <button type="submit" className="btn solid" disabled={!addAgreed}>
                Continuă spre plată →
              </button>
            </form>
          </div>
        )}

        {panel === "reduce" && sub.canReduce && (
          <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--line, #eef0f2)", borderRadius: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Câte locuri păstrați de la {fromDate}?</label>
            <input
              type="number"
              min={sub.minReduceTo}
              max={sub.seats - 1}
              value={reduceTo}
              onChange={(e) => setReduceTo(Math.min(sub.seats - 1, Math.max(sub.minReduceTo, Math.floor(Number(e.target.value)) || sub.minReduceTo)))}
              style={{ width: 90, height: 38, padding: "0 10px" }}
            />
            <div style={{ fontSize: 13, color: "var(--ink2)", margin: "10px 0" }}>
              Până la {fromDate} agenția păstrează {seatsWord(sub.seats)}. De la {fromDate}: <b>{monthlyAfterReduce} {cur} / lună</b>.
              <br />
              <span style={{ color: "var(--ink3)" }}>
                Minimum {sub.minReduceTo} — locurile ocupate de colegi și cele rezervate prin coduri rămân. Nu se face nicio plată acum și
                nimic nu se returnează.
              </span>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={reduceAgreed} onChange={(e) => setReduceAgreed(e.target.checked)} style={{ marginTop: 3 }} />
              <span>{agencySeatsConsentText(monthlyAfterReduce, cur, reduceTo, fromDate)}</span>
            </label>
            <button
              className="btn solid"
              disabled={busy || !reduceAgreed}
              onClick={() =>
                call("/api/agency/subscription/seats", "POST", { seats: reduceTo, agreedToRecurring: true, consentVersion: seatsConsentVersion })
              }
            >
              Reduce la {seatsWord(reduceTo)} de la {fromDate}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
