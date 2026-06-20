// Формулы калькуляторов — единый источник для фронта (шаг 6) и сервера (/api/.../calculation).
// Перенесены 1:1 из docs/imoghid-v4.html.

export function fmtMdl(n: number): string {
  return Math.round(n).toLocaleString("ro-MD");
}

// ── Impozit creșterea de capital — Vânzare-cumpărare ──
// (Preț vânzare − Preț cumpărare) ÷ 2 × 12%
export function calcCapitalGain(buyPrice: number, sellPrice: number) {
  const capitalGain = sellPrice - buyPrice;
  const taxBase = capitalGain / 2;
  const taxAmount = taxBase * 0.12;
  return { capitalGain, taxBase, taxAmount };
}

// ── Donație ── Valoarea ÷ 2 × 12% (rude apropiate — scutire)
export function calcDonation(donationValue: number, relType: "family" | "other") {
  if (relType === "family") return { donationTaxAmount: 0, exempt: true };
  const taxBase = donationValue / 2;
  return { donationTaxAmount: taxBase * 0.12, exempt: false };
}

// ── Schimb ── (obiect mai scump − obiect mai ieftin) ÷ 2 × 12%
export function calcSchimb(v1: number, v2: number) {
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const schimbDiff = high - low;
  const schimbTaxBase = schimbDiff / 2;
  const schimbTaxAmount = schimbTaxBase * 0.12;
  return { high, low, schimbDiff, schimbTaxBase, schimbTaxAmount };
}

// ── Notariat — Legea 271/2003 ──
// Tranșe persoane fizice (9 trepte, min 120 MDL; ≤20k → max(1.3%, 180)).
export function notaryFeeFizic(val: number): { fee: number; pct: string } {
  let fee: number;
  let pct: string;
  if (val <= 20000) {
    fee = Math.max(val * 0.013, 180);
    pct = "1,3%";
  } else if (val <= 50000) {
    fee = val * 0.01;
    pct = "1,0%";
  } else if (val <= 100000) {
    fee = val * 0.009;
    pct = "0,9%";
  } else if (val <= 200000) {
    fee = val * 0.008;
    pct = "0,8%";
  } else if (val <= 400000) {
    fee = val * 0.006;
    pct = "0,6%";
  } else if (val <= 600000) {
    fee = val * 0.005;
    pct = "0,5%";
  } else if (val <= 800000) {
    fee = val * 0.003;
    pct = "0,3%";
  } else if (val <= 1000000) {
    fee = val * 0.002;
    pct = "0,2%";
  } else {
    fee = val * 0.001;
    pct = "0,1%";
  }
  return { fee: Math.max(fee, 120), pct };
}

// Tranșe persoane juridice (3 trepte, min 120 MDL).
export function notaryFeeJuridic(val: number): { fee: number; pct: string } {
  let fee: number;
  let pct: string;
  if (val < 800000) {
    fee = val * 0.005;
    pct = "0,5%";
  } else if (val <= 1000000) {
    fee = val * 0.002;
    pct = "0,2%";
  } else {
    fee = val * 0.001;
    pct = "0,1%";
  }
  return { fee: Math.max(fee, 120), pct };
}

// Полный расчёт нотариата + такса де стат (по умолчанию 0,5%).
export function calcNotary(
  val: number,
  isLegalEntity: boolean,
  taxStatPct = 0.005,
) {
  const { fee, pct } = isLegalEntity ? notaryFeeJuridic(val) : notaryFeeFizic(val);
  const taxStatAmount = val * taxStatPct;
  return {
    notaryFeeAmount: fee,
    notaryFeePct: pct,
    taxStatAmount,
    taxStatPct,
    notaryTotal: fee + taxStatAmount,
  };
}

// ── Credit ipotecar ── аннуитет, 20 лет (240 мес).
export function monthlyPayment(loanEur: number, annualRatePct: number): number {
  const r = annualRatePct / 100 / 12;
  const n = 240;
  return Math.round((loanEur * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1));
}

export const MORTGAGE_BANKS = [
  { name: "MAIB", rate: 7.9 },
  { name: "Victoriabank", rate: 8.2 },
  { name: "OTP Bank", rate: 8.5 },
] as const;
