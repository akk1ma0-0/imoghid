import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/transactions/[id]/owners — список собственников (опц. ?objectIndex=).
export async function GET(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  const url = new URL(request.url);
  const oi = url.searchParams.get("objectIndex");
  const owners = await prisma.propertyOwner.findMany({
    where: {
      transactionId: id,
      ...(oi === "1" || oi === "2" ? { objectIndex: Number(oi) } : {}),
    },
    orderBy: { objectIndex: "asc" },
  });
  return NextResponse.json({ owners });
}
