// Моковые объявления 999.md. Структура совпадает с моделью Listing999 (prisma/schema.prisma).
// Реальный парсер заменит ТОЛЬКО lib/listings-service.ts → getListings(); этот файл — временный источник.

export type ListingType = "APARTAMENT" | "CASA" | "TEREN" | "COMERCIAL";
export type PriceChange = "UP" | "DOWN" | "STABLE";

export type MockListing = {
  id: string;
  externalId: string;
  url: string;
  listingType: ListingType;
  sector: string | null; // Botanica, Centru, Râșcani, Ciocana, Buiucani
  address: string | null;
  priceEur: number | null;
  priceMdl: number | null;
  rooms: number | null;
  areaM2: number | null;
  floor: number | null;
  totalFloors: number | null;
  description: string | null;
  imageUrls: string[];
  isOwner: boolean;
  ownerScore: number | null;
  priceChange: PriceChange;
  priceDiffEur: number | null; // величина изменения (для DOWN/UP)
  isActive: boolean;
  isArchived: boolean;

  // display-only: реальный парсер вычислит чёрный список по SHA-256 телефона из BlacklistReport.
  freshLabel: string; // "NOU · azi", "acum 2 ore"
  blacklist: { tag: "AGENT_ASCUNS" | "OBIECT_FALS"; reportCount: number; note: string } | null;
};

const u = (id: string) => `https://999.md/ro/${id}`;

export const MOCK_LISTINGS: MockListing[] = [
  {
    id: "lst-001", externalId: "99900001", url: u("99900001"),
    listingType: "APARTAMENT", sector: "Botanica", address: "str. Independenței",
    priceEur: 72500, priceMdl: 1413750, rooms: 2, areaM2: 62, floor: 5, totalFloors: 9,
    description: "Reparație medie · centrală autonomă", imageUrls: [],
    isOwner: true, ownerScore: 0.92, priceChange: "DOWN", priceDiffEur: 3500,
    isActive: true, isArchived: false, freshLabel: "NOU · azi", blacklist: null,
  },
  {
    id: "lst-002", externalId: "99900002", url: u("99900002"),
    listingType: "CASA", sector: "Buiucani", address: "str. Trandafirilor",
    priceEur: 165000, priceMdl: 3217500, rooms: 4, areaM2: 145, floor: null, totalFloors: 2,
    description: "Teren 8 ari · gaz", imageUrls: [],
    isOwner: true, ownerScore: 0.88, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "NOU · azi", blacklist: null,
  },
  {
    id: "lst-003", externalId: "99900003", url: u("99900003"),
    listingType: "APARTAMENT", sector: "Centru", address: "str. Armenească",
    priceEur: 49000, priceMdl: 955500, rooms: 1, areaM2: 38, floor: 3, totalFloors: 5,
    description: null, imageUrls: [],
    isOwner: true, ownerScore: 0.4, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "acum 2 ore",
    blacklist: { tag: "AGENT_ASCUNS", reportCount: 3, note: "Agent ascuns sub identitate de proprietar" },
  },
  {
    id: "lst-004", externalId: "99900004", url: u("99900004"),
    listingType: "APARTAMENT", sector: "Râșcani", address: "str. Kiev",
    priceEur: 89000, priceMdl: 1735500, rooms: 3, areaM2: 78, floor: 7, totalFloors: 10,
    description: "Agenție imobiliară", imageUrls: [],
    isOwner: false, ownerScore: 0.15, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "acum 5 ore", blacklist: null,
  },
  {
    id: "lst-005", externalId: "99900005", url: u("99900005"),
    listingType: "APARTAMENT", sector: "Ciocana", address: "str. Mircea cel Bătrân",
    priceEur: 58000, priceMdl: 1131000, rooms: 2, areaM2: 54, floor: 4, totalFloors: 9,
    description: "Mobilat · lângă școală", imageUrls: [],
    isOwner: true, ownerScore: 0.85, priceChange: "DOWN", priceDiffEur: 2000,
    isActive: true, isArchived: false, freshLabel: "ieri", blacklist: null,
  },
  {
    id: "lst-006", externalId: "99900006", url: u("99900006"),
    listingType: "TEREN", sector: "Botanica", address: "str. Sarmizegetusa",
    priceEur: 35000, priceMdl: 682500, rooms: null, areaM2: 600, floor: null, totalFloors: null,
    description: "6 ari · pentru construcție · agenție", imageUrls: [],
    isOwner: false, ownerScore: 0.1, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "ieri", blacklist: null,
  },
  {
    id: "lst-007", externalId: "99900007", url: u("99900007"),
    listingType: "APARTAMENT", sector: "Centru", address: "bd. Ștefan cel Mare",
    priceEur: 145000, priceMdl: 2827500, rooms: 4, areaM2: 110, floor: 2, totalFloors: 4,
    description: "Bloc nou · parcare subterană", imageUrls: [],
    isOwner: true, ownerScore: 0.9, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "acum 3 ore", blacklist: null,
  },
  {
    id: "lst-008", externalId: "99900008", url: u("99900008"),
    listingType: "APARTAMENT", sector: "Buiucani", address: "str. Alba Iulia",
    priceEur: 41000, priceMdl: 799500, rooms: 1, areaM2: 33, floor: 9, totalFloors: 9,
    description: "Necesită reparație", imageUrls: [],
    isOwner: true, ownerScore: 0.78, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "acum 6 ore", blacklist: null,
  },
  {
    id: "lst-009", externalId: "99900009", url: u("99900009"),
    listingType: "CASA", sector: "Râșcani", address: "str. Doina",
    priceEur: 175000, priceMdl: 3412500, rooms: 5, areaM2: 200, floor: null, totalFloors: 2,
    description: "Teren 6 ari · agenție", imageUrls: [],
    isOwner: false, ownerScore: 0.2, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "ieri", blacklist: null,
  },
  {
    id: "lst-010", externalId: "99900010", url: u("99900010"),
    listingType: "TEREN", sector: "Ciocana", address: "str. Vadul lui Vodă",
    priceEur: 52000, priceMdl: 1014000, rooms: null, areaM2: 1000, floor: null, totalFloors: null,
    description: "10 ari · acces asfaltat", imageUrls: [],
    isOwner: true, ownerScore: 0.82, priceChange: "STABLE", priceDiffEur: null,
    isActive: true, isArchived: false, freshLabel: "azi", blacklist: null,
  },
];

export const SECTORS = ["Botanica", "Centru", "Râșcani", "Ciocana", "Buiucani"];
