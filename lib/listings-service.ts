import type { Prisma } from "@prisma/client";
import { MOCK_LISTINGS, type MockListing, type ListingType } from "@/lib/listings-mock";

// Точка подключения реального парсера 999.md. Сейчас отдаёт моковые данные.
// Когда появится парсер — меняем ТОЛЬКО реализацию getListings()/getListingById();
// API-роуты и UI не трогаем.

export type ListingFilters = {
  sector?: string | null;
  type?: ListingType | null;
  priceMin?: number | null;
  priceMax?: number | null;
  rooms?: number | null;
  priceDropped?: boolean;
  ownerOnly?: boolean;
};

export async function getListings(filters: ListingFilters = {}): Promise<MockListing[]> {
  let items = MOCK_LISTINGS.filter((l) => l.isActive && !l.isArchived);

  if (filters.type) items = items.filter((l) => l.listingType === filters.type);
  if (filters.sector) items = items.filter((l) => l.sector === filters.sector);
  if (filters.ownerOnly) items = items.filter((l) => l.isOwner);
  if (filters.priceDropped) items = items.filter((l) => l.priceChange === "DOWN");
  if (filters.rooms != null) items = items.filter((l) => l.rooms === filters.rooms);
  if (filters.priceMin != null)
    items = items.filter((l) => (l.priceEur ?? 0) >= filters.priceMin!);
  if (filters.priceMax != null)
    items = items.filter((l) => (l.priceEur ?? 0) <= filters.priceMax!);

  return items;
}

export async function getListingById(id: string): Promise<MockListing | null> {
  return MOCK_LISTINGS.find((l) => l.id === id) ?? null;
}

// Analiză de piață (CMA). Данные демо — из того же mock-источника, что и модуль 999.
// Реальные данные подключатся заменой здесь (B2B-доступ к 999.md).
export async function getCmaStats(): Promise<{
  segment: string;
  avgPricePerM2: number;
  avgDaysToSell: number;
  count90d: number;
}> {
  const apts = MOCK_LISTINGS.filter(
    (l) => l.listingType === "APARTAMENT" && l.priceEur && l.areaM2,
  );
  const perM2 = apts.map((l) => l.priceEur! / l.areaM2!);
  const avgPricePerM2 = perM2.length
    ? Math.round(perM2.reduce((a, b) => a + b, 0) / perM2.length)
    : 0;
  return {
    segment: "sec. Ciocana, 2 odăi",
    avgPricePerM2,
    avgDaysToSell: 43, // демо-константа (mock не хранит срок продажи)
    count90d: apts.length,
  };
}

// Маппинг мок-объявления в данные для записи Listing999 (materializare при сохранении контакта).
export function toListingCreateData(l: MockListing): Prisma.Listing999CreateInput {
  return {
    id: l.id,
    externalId: l.externalId,
    url: l.url,
    listingType: l.listingType,
    sector: l.sector,
    address: l.address,
    priceEur: l.priceEur,
    priceMdl: l.priceMdl,
    rooms: l.rooms,
    areaM2: l.areaM2,
    floor: l.floor,
    totalFloors: l.totalFloors,
    description: l.description,
    imageUrls: l.imageUrls,
    isOwner: l.isOwner,
    ownerScore: l.ownerScore,
    priceChange: l.priceChange,
    priceDiffEur: l.priceDiffEur,
    isActive: l.isActive,
    isArchived: l.isArchived,
  };
}
