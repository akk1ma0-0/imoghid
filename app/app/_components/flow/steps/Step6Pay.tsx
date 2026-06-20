import { useMemo, useState } from "react";
import type { FlowTx } from "../types";
import {
  calcCapitalGain,
  calcDonation,
  calcSchimb,
  calcNotary,
  monthlyPayment,
  MORTGAGE_BANKS,
  fmtMdl,
} from "@/lib/calc";

function num(s: string): number {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function Step6Pay({
  tx,
  reload,
  onNext,
}: {
  tx: FlowTx;
  reload: () => Promise<void>;
  onNext: () => void;
}) {
  const isDon = tx.dealType === "DONATIE";
  const isSch = tx.dealType === "SCHIMB";
  const isAlt = tx.dealType === "ALT_TIP";
  const isVc = tx.dealType === "VANZARE_CUMPARARE";

  // Prefill prețul de cumpărare din câmpurile extrase.
  const extractedBuy =
    tx.extractedFields.find((f) => f.objectIndex === 1 && f.fieldName === "purchase_price")?.value ??
    tx.calculation?.buyPrice?.toString() ??
    "";

  const [entity, setEntity] = useState<"fiz" | "jur">("fiz");
  const [buyPrice, setBuyPrice] = useState(extractedBuy);
  const [sellPrice, setSellPrice] = useState(tx.calculation?.sellPrice?.toString() ?? "");
  const [isExempt, setIsExempt] = useState(tx.calculation?.isExempt ?? false);
  const [donRel, setDonRel] = useState<"" | "family" | "other">("");
  const [donVal, setDonVal] = useState("");
  const [schV1, setSchV1] = useState("");
  const [schV2, setSchV2] = useState("");
  const [surcharge, setSurcharge] = useState(false); // sultă
  const [surchargeVal, setSurchargeVal] = useState("");
  const [notaryVal, setNotaryVal] = useState("");
  const [propVal, setPropVal] = useState("");
  const [downPay, setDownPay] = useState("");
  const [busy, setBusy] = useState(false);

  const vc = useMemo(() => calcCapitalGain(num(buyPrice), num(sellPrice)), [buyPrice, sellPrice]);
  const sch = useMemo(() => calcSchimb(num(schV1), num(schV2)), [schV1, schV2]);
  const don = useMemo(
    () => (donRel ? calcDonation(num(donVal), donRel) : null),
    [donVal, donRel],
  );
  const notary = useMemo(
    () => (num(notaryVal) > 0 ? calcNotary(num(notaryVal), entity === "jur") : null),
    [notaryVal, entity],
  );
  const loan = Math.max(0, num(propVal) - num(downPay));

  async function next() {
    setBusy(true);
    await fetch(`/api/transactions/${tx.id}/calculation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyPrice: num(buyPrice) || null,
        sellPrice: num(sellPrice) || null,
        isExempt,
        donationValue: num(donVal) || null,
        donationRelType: donRel || null,
        schimbValue1: num(schV1) || null,
        schimbValue2: num(schV2) || null,
        notaryTransactionValue: num(notaryVal) || null,
        sellerIsLegalEntity: entity === "jur",
        propertyValueEur: num(propVal) || null,
        downPaymentEur: num(downPay) || null,
      }),
    });
    await reload();
    setBusy(false);
    onNext();
  }

  return (
    <div>
      {!isDon && (
        <div className="toggle-row">
          <button
            className={`toggle-opt${entity === "fiz" ? " on" : ""}`}
            onClick={() => setEntity("fiz")}
          >
            Persoană fizică
          </button>
          <button
            className={`toggle-opt${entity === "jur" ? " on" : ""}`}
            onClick={() => setEntity("jur")}
          >
            Persoană juridică
          </button>
        </div>
      )}

      {/* IMPOZIT */}
      <div className="card">
        <div className="card-hd">
          <b>Impozit creșterea de capital</b>
        </div>
        <div className="card-bd">
          {entity === "jur" && !isDon ? (
            <div className="notice blue" style={{ marginBottom: 0 }}>
              <div className="notice-dot" />
              <div>
                <b>Persoană juridică</b>
                <p>
                  Impozit pe creșterea de capital — 12% din profitul net. La imobile comerciale —
                  TVA 20%. Calculul exact îl face contabilul.
                </p>
              </div>
            </div>
          ) : isVc ? (
            <>
              <div className="field-group">
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isExempt}
                    onChange={(e) => setIsExempt(e.target.checked)}
                    style={{ width: "auto", marginTop: 3 }}
                  />
                  <span style={{ fontSize: 13 }}>
                    Vânzătorul a posedat cu viză de reședință mai mult de 3 ani
                  </span>
                </label>
              </div>
              {isExempt ? (
                <div className="notice green" style={{ marginBottom: 0 }}>
                  <div className="notice-dot" />
                  <div>
                    <b>Scutire de impozit</b>
                    <p>Posesie cu viză de reședință &gt; 3 ani — impozitul nu se aplică.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="calc-grid">
                    <div className="field-group">
                      <label>Prețul de cumpărare (MDL)</label>
                      <input type="number" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="430 000" />
                    </div>
                    <div className="field-group">
                      <label>Prețul de vânzare (MDL)</label>
                      <input type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="1 400 000" />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 6 }}>
                    Formula: (Preț vânzare − Preț cumpărare) ÷ 2 × 12%
                  </div>
                  <table className="calc">
                    <tbody>
                      <tr><td>Prețul de vânzare</td><td className="r">{num(sellPrice) ? fmtMdl(num(sellPrice)) + " MDL" : "—"}</td></tr>
                      <tr><td>Prețul de cumpărare</td><td className="r">{num(buyPrice) ? fmtMdl(num(buyPrice)) + " MDL" : "—"}</td></tr>
                      <tr><td>Creșterea de capital</td><td className="r">{vc.capitalGain > 0 ? fmtMdl(vc.capitalGain) + " MDL" : "—"}</td></tr>
                      <tr><td>Baza impozabilă (÷ 2)</td><td className="r">{vc.capitalGain > 0 ? fmtMdl(vc.taxBase) + " MDL" : "—"}</td></tr>
                      <tr className="tot"><td>Impozit (× 12%)</td><td className="r">{vc.capitalGain > 0 ? fmtMdl(vc.taxAmount) + " MDL" : "—"}</td></tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : isDon ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {(["family", "other"] as const).map((rel) => (
                  <label
                    key={rel}
                    style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", padding: "10px 12px", border: "1.5px solid var(--line)", borderRadius: "var(--r)" }}
                  >
                    <input type="radio" name="don_rel" checked={donRel === rel} onChange={() => setDonRel(rel)} style={{ width: "auto" }} />
                    <span>{rel === "family" ? "Rude apropiate" : "Alte persoane"}</span>
                  </label>
                ))}
              </div>
              {donRel === "family" && (
                <div className="notice green" style={{ marginBottom: 0 }}>
                  <div className="notice-dot" />
                  <div><b>Scutire de impozit</b><p>Donație între rude apropiate — impozitul nu se percepe.</p></div>
                </div>
              )}
              {donRel === "other" && (
                <>
                  <div className="field-group">
                    <label>Valoarea bunului donat (MDL)</label>
                    <input type="number" value={donVal} onChange={(e) => setDonVal(e.target.value)} placeholder="1 400 000" />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 6 }}>Formula: Valoarea ÷ 2 × 12%</div>
                  <table className="calc">
                    <tbody>
                      <tr><td>Valoarea bunului</td><td className="r">{num(donVal) ? fmtMdl(num(donVal)) + " MDL" : "—"}</td></tr>
                      <tr className="tot"><td>Impozit (× 12%)</td><td className="r">{don ? fmtMdl(don.donationTaxAmount) + " MDL" : "—"}</td></tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : isSch ? (
            <>
              <div className="calc-grid">
                <div className="field-group">
                  <label><b>Obiect 1</b> — preț de evaluare (MDL)</label>
                  <input type="number" value={schV1} onChange={(e) => setSchV1(e.target.value)} placeholder="800 000" />
                </div>
                <div className="field-group">
                  <label><b>Obiect 2</b> — preț de evaluare (MDL)</label>
                  <input type="number" value={schV2} onChange={(e) => setSchV2(e.target.value)} placeholder="600 000" />
                </div>
              </div>

              {/* Sultă — плата за разницу стоимости (информационно, не влияет на формулу) */}
              <div className="chk-row" style={{ cursor: "pointer" }} onClick={() => setSurcharge((v) => !v)}>
                <div className={`chk-box${surcharge ? " on" : ""}`} />
                <div className="chk-txt">
                  <b>Una dintre părți face o plată suplimentară (sultă)</b>
                  <small>Bifați dacă diferența de valoare se compensează printr-o sumă în bani</small>
                </div>
              </div>
              {surcharge && (
                <div className="field-group" style={{ marginTop: 8 }}>
                  <label>Suma plății suplimentare (MDL)</label>
                  <input
                    type="number"
                    value={surchargeVal}
                    onChange={(e) => setSurchargeVal(e.target.value)}
                    placeholder="200 000"
                  />
                </div>
              )}

              {num(schV1) > 0 && num(schV2) > 0 && (
                <>
                  <div style={{ fontSize: 11, color: "var(--ink3)", margin: "8px 0 6px" }}>
                    Formula: (Obiect mai scump − Obiect mai ieftin) ÷ 2 × 12%
                  </div>
                  <table className="calc">
                    <tbody>
                      <tr><td>Obiect mai scump</td><td className="r">{fmtMdl(sch.high)} MDL</td></tr>
                      <tr><td>Obiect mai ieftin</td><td className="r">{fmtMdl(sch.low)} MDL</td></tr>
                      <tr><td>Diferența</td><td className="r">{fmtMdl(sch.schimbDiff)} MDL</td></tr>
                      <tr><td>Baza impozabilă (÷ 2)</td><td className="r">{fmtMdl(sch.schimbTaxBase)} MDL</td></tr>
                      <tr className="tot"><td>Impozit (× 12%)</td><td className="r">{fmtMdl(sch.schimbTaxAmount)} MDL</td></tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : (
            <div className="notice blue" style={{ marginBottom: 0 }}>
              <div className="notice-dot" />
              <div><b>Alt tip de tranzacție</b><p>Calculul depinde de natura tranzacției. Consultați notarul.</p></div>
            </div>
          )}
        </div>
      </div>

      {/* NOTARIAT */}
      <div className="card">
        <div className="card-hd">
          <b>Autentificare notarială + Taxa de stat</b>
          <span className="badge b-gray" style={{ marginLeft: "auto" }}>Legea 271/2003</span>
        </div>
        <div className="card-bd">
          <div className="field-group" style={{ maxWidth: 300 }}>
            <label>Valoarea tranzacției (MDL)</label>
            <input type="number" value={notaryVal} onChange={(e) => setNotaryVal(e.target.value)} placeholder="1 400 000" />
          </div>
          <table className="calc">
            <tbody>
              <tr><td>Autentificare notarială ({notary?.notaryFeePct ?? "—"})</td><td className="r">{notary ? fmtMdl(notary.notaryFeeAmount) + " MDL" : "—"}</td></tr>
              <tr><td>Taxa de stat (0,5%)</td><td className="r">{notary ? fmtMdl(notary.taxStatAmount) + " MDL" : "—"}</td></tr>
              <tr className="tot"><td>Total orientativ</td><td className="r">{notary ? fmtMdl(notary.notaryTotal) + " MDL" : "—"}</td></tr>
            </tbody>
          </table>
          <div className="note note-warn" style={{ marginTop: 8 }}>
            Toate calculele sunt orientative. Suma exactă este calculată de notar.
          </div>
        </div>
      </div>

      {/* CREDIT */}
      <div className="card">
        <div className="card-hd">
          <b>Calculator credit ipotecar</b>
        </div>
        <div className="card-bd">
          <div className="calc-grid" style={{ marginBottom: 14 }}>
            <div className="field-group">
              <label>Valoarea obiectului (€)</label>
              <input type="number" value={propVal} onChange={(e) => setPropVal(e.target.value)} placeholder="80 000" />
            </div>
            <div className="field-group">
              <label>Avans (€)</label>
              <input type="number" value={downPay} onChange={(e) => setDownPay(e.target.value)} placeholder="20 000" />
            </div>
          </div>
          {MORTGAGE_BANKS.map((b) => (
            <div className="bank-row" key={b.name}>
              <div>
                {b.name} <span style={{ fontSize: 11, color: "var(--ink3)" }}>· 20 ani</span>
              </div>
              <div className="bank-rate">{b.rate}%</div>
              <div className="bank-pay">{loan > 0 ? `${monthlyPayment(loan, b.rate)} €/lună` : "— €/lună"}</div>
            </div>
          ))}
          <div className="note note-warn" style={{ marginTop: 10 }}>Ratele sunt orientative · verificați la bancă.</div>
        </div>
      </div>

      <button className="btn solid" onClick={next} disabled={busy}>
        {busy ? "Se salvează…" : "Continuați → raport"}
      </button>
    </div>
  );
}
