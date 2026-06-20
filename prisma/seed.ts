import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Тестовый код приглашения для активации PRO (см. поток /register и /subscribe).
  const invite = await prisma.inviteCode.upsert({
    where: { code: "IMOTEST2025" },
    update: {},
    create: {
      code: "IMOTEST2025",
      plan: "PRO",
      maxUses: 50,
      createdBy: {
        connectOrCreate: {
          where: { email: "admin@imoghid.md" },
          create: {
            email: "admin@imoghid.md",
            name: "Admin ImoGhid",
            passwordHash: await bcrypt.hash("Admin1234", 10),
            role: "ADMIN",
            plan: "PRO",
            planActivatedAt: new Date(),
          },
        },
      },
    },
  });

  // Демо-агент с активным планом BASIC (email: demo@imoghid.md, parolă: Demo1234).
  const demo = await prisma.user.upsert({
    where: { email: "demo@imoghid.md" },
    update: {},
    create: {
      email: "demo@imoghid.md",
      name: "Demo Agent",
      phone: "+37369000000",
      passwordHash: await bcrypt.hash("Demo1234", 10),
      plan: "BASIC",
      planActivatedAt: new Date(),
    },
  });

  // ── Reguli juridice (editabile fără deploy) — folosite de motorul de semnale și checklist ──
  const legalRules = [
    {
      code: "AREA_MISMATCH",
      titleRo: "Discrepanță de suprafață",
      descriptionRo:
        "Suprafața din extras și actul de drept nu coincid. Necesită clarificare înainte de notar.",
      legalActRo: "Legea Cadastrului bunurilor imobile",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=108376&lang=ro",
      severity: "RED" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
    {
      code: "NOT_ACTUALIZED",
      titleRo: "Date personale neactualizate",
      descriptionRo:
        "Înregistrarea conține inițiale în loc de numele complet. Necesită actualizare în Cadastru.",
      legalActRo: "Legea Cadastrului bunurilor imobile",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=108376&lang=ro",
      severity: "AMBER" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
    {
      code: "PRIVATIZARE_CERT",
      titleRo: "Certificat de privatizare",
      descriptionRo:
        "Temeiul dreptului implică verificarea certificatului privind participanții la privatizare.",
      legalActRo: "Codul civil",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=140&lang=ro",
      severity: "AMBER" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
    {
      code: "LEGAL_ENTITY_SELLER",
      titleRo: "Vânzător persoană juridică",
      descriptionRo:
        "Sunt necesare hotărârea fondatorilor și verificarea împuternicirilor reprezentantului.",
      legalActRo: "Codul civil",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=140&lang=ro",
      severity: "AMBER" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
    {
      code: "MARRIED_CONSENT",
      titleRo: "Acordul soțului",
      descriptionRo:
        "La proprietate comună în devălmășie, acordul soțului este obligatoriu.",
      legalActRo: "Codul familiei art. 20–22",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=13266&lang=ro",
      severity: "RED" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
    {
      code: "MINOR_TUTOR",
      titleRo: "Autorizația autorității tutelare",
      descriptionRo:
        "Dacă un coproprietar este minor, este necesară autorizația autorității tutelare.",
      legalActRo: "Codul familiei",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=13266&lang=ro",
      severity: "AMBER" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
    {
      code: "PROCURA_CHECK",
      titleRo: "Verificarea procurii",
      descriptionRo:
        "Dacă se acționează prin reprezentant — verificați: specială, termen de valabilitate, formă notarială.",
      legalActRo: "Codul civil",
      legalActUrl: "https://www.legis.md/cautare/getResults?doc_id=140&lang=ro",
      severity: "AMBER" as const,
      zone: "VERIFICARE_MANUALA" as const,
    },
  ];

  for (const rule of legalRules) {
    await prisma.legalRule.upsert({
      where: { code: rule.code },
      update: {},
      create: rule,
    });
  }

  console.log("Seeded invite:", invite.code);
  console.log("Seeded demo user:", demo.email);
  console.log("Seeded legal rules:", legalRules.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
