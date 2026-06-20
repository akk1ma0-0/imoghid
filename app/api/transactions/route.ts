import { NextResponse } from "next/server";
import type { DealType, PartyType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { stepToNumber, TOTAL_STEPS } from "@/lib/steps";

const DEAL_TYPES: DealType[] = ["VANZARE_CUMPARARE", "DONATIE", "SCHIMB", "ALT_TIP"];
const PARTY_TYPES: PartyType[] = ["PERSOANA_FIZICA", "PERSOANA_JURIDICA"];

// POST /api/transactions — создать транзакцию из формы шага 1.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const address = str(body.address);
  const cadastralNo = str(body.cadastralNo);
  if (!address && !cadastralNo) {
    return NextResponse.json(
      { error: "Introduceți adresa sau numărul cadastral." },
      { status: 400 },
    );
  }

  const dealType = DEAL_TYPES.includes(body.dealType as DealType)
    ? (body.dealType as DealType)
    : "VANZARE_CUMPARARE";
  const sellerType = PARTY_TYPES.includes(body.sellerType as PartyType)
    ? (body.sellerType as PartyType)
    : "PERSOANA_FIZICA";
  const buyerType = PARTY_TYPES.includes(body.buyerType as PartyType)
    ? (body.buyerType as PartyType)
    : "PERSOANA_FIZICA";

  const tx = await prisma.transaction.create({
    data: {
      userId: sess.userId,
      address,
      cadastralNo,
      objectType: str(body.objectType),
      suprafata: str(body.suprafata),
      destinatie: str(body.destinatie),
      valoare: str(body.valoare),
      dealType,
      sellerType,
      buyerType,
      clientName: str(body.clientName),
      clientPhone: str(body.clientPhone),
      clientContractRef: str(body.clientContractRef),
      currentStep: "DATE_OBIECT",
    },
    select: { id: true },
  });

  return NextResponse.json({ id: tx.id }, { status: 201 });
}

// GET /api/transactions — список транзакций пользователя для «Obiectele mele».
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const rows = await prisma.transaction.findMany({
    where: { userId: sess.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      address: true,
      objectType: true,
      clientName: true,
      clientContractRef: true,
      dealType: true,
      currentStep: true,
      status: true,
      completedAt: true,
      createdAt: true,
      calculation: {
        select: { sellPrice: true, schimbValue1: true, notaryTransactionValue: true },
      },
    },
  });

  const transactions = rows.map((t) => {
    const price =
      t.calculation?.sellPrice ??
      t.calculation?.schimbValue1 ??
      t.calculation?.notaryTransactionValue ??
      null;
    return {
      id: t.id,
      address: t.address,
      objectType: t.objectType,
      clientName: t.clientName,
      clientContractRef: t.clientContractRef,
      dealType: t.dealType,
      currentStep: stepToNumber(t.currentStep),
      totalSteps: TOTAL_STEPS,
      price,
      status: t.status.toLowerCase(), // active | waiting | done | archive
      createdAt: t.createdAt,
    };
  });

  return NextResponse.json({ transactions });
}
