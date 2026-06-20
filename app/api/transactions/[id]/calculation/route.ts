import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";
import { calcCapitalGain, calcDonation, calcSchimb, calcNotary } from "@/lib/calc";

type Params = { params: Promise<{ id: string }> };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

// POST /api/transactions/[id]/calculation — пересчёт и upsert TransactionCalculation.
export async function POST(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const data: Prisma.TransactionCalculationUncheckedCreateInput = { transactionId: id };

  // Impozit — Vânzare-cumpărare
  const buyPrice = num(body.buyPrice);
  const sellPrice = num(body.sellPrice);
  const isExempt = body.isExempt === true;
  data.buyPrice = buyPrice;
  data.sellPrice = sellPrice;
  data.isExempt = isExempt;
  if (!isExempt && buyPrice !== null && sellPrice !== null) {
    const { capitalGain, taxBase, taxAmount } = calcCapitalGain(buyPrice, sellPrice);
    data.capitalGain = capitalGain;
    data.taxBase = taxBase;
    data.taxAmount = taxAmount;
  }

  // Donație
  const donationValue = num(body.donationValue);
  const donationRelType =
    body.donationRelType === "family" || body.donationRelType === "other"
      ? (body.donationRelType as "family" | "other")
      : null;
  if (donationValue !== null && donationRelType) {
    data.donationValue = donationValue;
    data.donationRelType = donationRelType;
    data.donationTaxAmount = calcDonation(donationValue, donationRelType).donationTaxAmount;
  }

  // Schimb
  const v1 = num(body.schimbValue1);
  const v2 = num(body.schimbValue2);
  if (v1 !== null && v2 !== null) {
    const s = calcSchimb(v1, v2);
    data.schimbValue1 = v1;
    data.schimbValue2 = v2;
    data.schimbDiff = s.schimbDiff;
    data.schimbTaxBase = s.schimbTaxBase;
    data.schimbTaxAmount = s.schimbTaxAmount;
  }

  // Notariat — Legea 271/2003
  const notaryVal = num(body.notaryTransactionValue);
  if (notaryVal !== null) {
    const n = calcNotary(notaryVal, body.sellerIsLegalEntity === true);
    data.notaryTransactionValue = notaryVal;
    data.notaryFeeAmount = n.notaryFeeAmount;
    data.notaryFeePct = parseFloat(n.notaryFeePct.replace(",", ".")) / 100;
    data.taxStatAmount = n.taxStatAmount;
    data.taxStatPct = n.taxStatPct;
    data.notaryTotal = n.notaryTotal;
  }

  // Credit ipotecar (только хранение входов)
  data.propertyValueEur = num(body.propertyValueEur);
  data.downPaymentEur = num(body.downPaymentEur);

  const { transactionId: _omit, ...update } = data;
  void _omit;
  const calculation = await prisma.transactionCalculation.upsert({
    where: { transactionId: id },
    create: data,
    update,
  });

  return NextResponse.json({ calculation });
}
