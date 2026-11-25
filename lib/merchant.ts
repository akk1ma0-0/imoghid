// Реквизиты продавца (договор с банком EC7122/231126) — ЕДИНЫЙ источник для футеров, квитанции и
// юридических страниц. Без серверных зависимостей: импортируется и клиентом, и сервером.
// VB_MERCH_NAME / VB_MERCH_ADDRESS (lib/vb-egateway.ts) — отдельные параметры шлюза VictoriaBank,
// здесь не используются и без согласования с банком не меняются.
export const MERCHANT = {
  legalName: "BLACKSPACE TECH SRL",
  idno: "1024600065567",
  address: "mun. Chișinău, bd. Decebal 99D, of. 40, MD-2038",
  country: "Moldova",
  phone: "+373 69 427 567",
  email: "info@biseeth.md",
  supportHours: "Luni–Vineri, 09:00–18:00 (ora Chișinău)",
  site: "imoghid.md",
  siteUrl: "https://imoghid.md",
} as const;

// Одна строка реквизитов (для писем и компактных футеров).
export const MERCHANT_LINE = `${MERCHANT.legalName} · IDNO ${MERCHANT.idno} · ${MERCHANT.address}`;
