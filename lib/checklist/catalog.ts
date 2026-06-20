import type { DealType } from "@prisma/client";

export type ChecklistTemplate = {
  party: "VANZATOR" | "CUMPARATOR";
  documentKey: string;
  labelRo: string;
  isRequired: boolean;
  sortOrder: number;
};

// Генерация списка документов для нотариуса по типу сделки и наличию флагов.
// Список (ключи/метки) соответствует дизайну docs/imoghid-v4.html (Pasul 5).
export function buildChecklist(opts: {
  dealType: DealType;
  flagCodes: string[];
  hasLegalEntitySeller: boolean;
  needsSpouseConsent: boolean;
}): ChecklistTemplate[] {
  const { flagCodes, hasLegalEntitySeller, needsSpouseConsent } = opts;
  const items: ChecklistTemplate[] = [];

  // ── Vânzător ──
  items.push(
    { party: "VANZATOR", documentKey: "act_de_drept", labelRo: "Act de drept", isRequired: true, sortOrder: 10 },
    { party: "VANZATOR", documentKey: "extras_registru", labelRo: "Extras din Registrul bunurilor imobile", isRequired: true, sortOrder: 20 },
    { party: "VANZATOR", documentKey: "extras_capitol_suplimentar", labelRo: "Extras din capitolul suplimentar din Registrul bunurilor imobile", isRequired: true, sortOrder: 30 },
  );
  if (needsSpouseConsent) {
    items.push({ party: "VANZATOR", documentKey: "acord_sot", labelRo: "Acordul soțului/coproprietarilor", isRequired: true, sortOrder: 40 });
  }
  items.push({ party: "VANZATOR", documentKey: "act_identitate", labelRo: "Act de identitate", isRequired: true, sortOrder: 50 });
  if (flagCodes.includes("PRIVATIZARE_CERT")) {
    items.push({ party: "VANZATOR", documentKey: "certificat_privatizare", labelRo: "Certificat privind participanții la privatizare", isRequired: true, sortOrder: 55 });
  }
  if (hasLegalEntitySeller) {
    items.push({ party: "VANZATOR", documentKey: "hotarare_fondatori", labelRo: "Hotărârea fondatorilor", isRequired: true, sortOrder: 58 });
  }
  items.push({ party: "VANZATOR", documentKey: "procura", labelRo: "Procură", isRequired: false, sortOrder: 60 });

  // ── Cumpărător ──
  items.push(
    { party: "CUMPARATOR", documentKey: "act_identitate", labelRo: "Act de identitate", isRequired: true, sortOrder: 70 },
    { party: "CUMPARATOR", documentKey: "dovada_provenientei", labelRo: "Dovada provenienței banilor", isRequired: true, sortOrder: 80 },
    { party: "CUMPARATOR", documentKey: "procura", labelRo: "Procură", isRequired: false, sortOrder: 90 },
  );

  return items;
}
