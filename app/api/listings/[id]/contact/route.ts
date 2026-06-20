import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { getListingById, toListingCreateData } from "@/lib/listings-service";

type Params = { params: Promise<{ id: string }> };

// Гарантирует наличие строки Listing999 в БД (FK для SavedListingContact).
// При реальном парсере объявления уже будут в БД — этот upsert станет no-op.
async function ensureListing(id: string): Promise<boolean> {
  const mock = await getListingById(id);
  if (!mock) return false;
  await prisma.listing999.upsert({
    where: { id },
    update: { lastSeenAt: new Date(), isActive: true },
    create: toListingCreateData(mock),
  });
  return true;
}

// GET — личный контакт текущего пользователя для объявления.
export async function GET(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const contact = await prisma.savedListingContact.findUnique({
    where: { userId_listingId: { userId: sess.userId, listingId: id } },
    select: { phone: true, note: true, updatedAt: true },
  });
  return NextResponse.json({ contact: contact ?? null });
}

// POST — создать/обновить приватный контакт (телефон вводит риелтор вручную).
export async function POST(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  const ok = await ensureListing(id);
  if (!ok) return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });

  const contact = await prisma.savedListingContact.upsert({
    where: { userId_listingId: { userId: sess.userId, listingId: id } },
    update: { phone, note },
    create: { userId: sess.userId, listingId: id, phone, note },
    select: { phone: true, note: true },
  });
  return NextResponse.json({ contact });
}

// DELETE — удалить приватный контакт.
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  await prisma.savedListingContact.deleteMany({
    where: { userId: sess.userId, listingId: id },
  });
  return NextResponse.json({ ok: true });
}
