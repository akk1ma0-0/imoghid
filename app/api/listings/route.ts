import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { getListings, type ListingFilters } from "@/lib/listings-service";
import type { ListingType } from "@/lib/listings-mock";

const TYPES: ListingType[] = ["APARTAMENT", "CASA", "TEREN", "COMERCIAL"];

// GET /api/listings — объявления с фильтрами + личный сохранённый контакт текущего пользователя.
export async function GET(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const sp = new URL(request.url).searchParams;
  const numOrNull = (v: string | null) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const typeRaw = sp.get("type");
  const filters: ListingFilters = {
    sector: sp.get("sector") || null,
    type: typeRaw && TYPES.includes(typeRaw as ListingType) ? (typeRaw as ListingType) : null,
    priceMin: numOrNull(sp.get("priceMin")),
    priceMax: numOrNull(sp.get("priceMax")),
    rooms: numOrNull(sp.get("rooms")),
    priceDropped: sp.get("priceDropped") === "1",
    ownerOnly: sp.get("ownerOnly") === "1",
  };

  const listings = await getListings(filters);

  // Приватные контакты текущего пользователя (видны только ему) — один запрос.
  const contacts = await prisma.savedListingContact.findMany({
    where: { userId: sess.userId, listingId: { in: listings.map((l) => l.id) } },
    select: { listingId: true, phone: true, note: true },
  });
  const byListing = new Map(contacts.map((c) => [c.listingId, c]));

  return NextResponse.json({
    listings: listings.map((l) => ({
      ...l,
      savedContact: byListing.get(l.id)
        ? { phone: byListing.get(l.id)!.phone, note: byListing.get(l.id)!.note }
        : null,
    })),
  });
}
