/**
 * Точечный фикс двух пользователей в БД. Безопасный:
 *  - по умолчанию РЕЖИМ ЧТЕНИЯ (только SELECT, показывает текущее состояние);
 *  - реальные UPDATE выполняются ТОЛЬКО с флагом --apply;
 *  - каждый апдейт адресный: where: { email: '<конкретный адрес>' } (email уникален → ровно 1 строка).
 *
 * Запуск против ПРОДА (Neon), т.к. локальный .env указывает на localhost:
 *   DATABASE_URL="<prod-neon-url>" npx tsx scripts/fix-prod-users.ts           # dry-run (только показать)
 *   DATABASE_URL="<prod-neon-url>" npx tsx scripts/fix-prod-users.ts --apply   # выполнить UPDATE
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const TARGETS = {
  verifyEmail: "admin@imoghid.md",
  makeAdmin: "popovschi.alex@gmail.com",
};

const view = (u: {
  email: string;
  role: string;
  emailVerified: Date | null;
  createdAt: Date;
} | null) =>
  u
    ? { email: u.email, role: u.role, emailVerified: u.emailVerified, createdAt: u.createdAt }
    : null;

async function snapshot(label: string) {
  const [a, b] = await Promise.all([
    prisma.user.findUnique({ where: { email: TARGETS.verifyEmail } }),
    prisma.user.findUnique({ where: { email: TARGETS.makeAdmin } }),
  ]);
  console.log(`\n=== ${label} ===`);
  console.log(TARGETS.verifyEmail, "→", view(a));
  console.log(TARGETS.makeAdmin, "→", view(b));
  return { a, b };
}

async function main() {
  const before = await snapshot("СОСТОЯНИЕ ДО");

  if (!before.a) throw new Error(`НЕ НАЙДЕН: ${TARGETS.verifyEmail} — апдейт отменён`);
  if (!before.b) throw new Error(`НЕ НАЙДЕН: ${TARGETS.makeAdmin} — апдейт отменён`);

  if (!APPLY) {
    console.log("\n[DRY-RUN] Флаг --apply не задан → изменения НЕ внесены. Запросы, которые будут выполнены:");
    console.log(`  UPDATE users SET "emailVerified" = now() WHERE email = '${TARGETS.verifyEmail}';`);
    console.log(`  UPDATE users SET "role" = 'ADMIN'        WHERE email = '${TARGETS.makeAdmin}';`);
    return;
  }

  // Апдейт 1 — подтвердить e-mail admin (письмом невозможно: у imoghid.md нет MX)
  await prisma.user.update({
    where: { email: TARGETS.verifyEmail },
    data: { emailVerified: new Date() },
  });
  // Апдейт 2 — назначить роль ADMIN (в админ-панели нет UI для смены роли)
  await prisma.user.update({
    where: { email: TARGETS.makeAdmin },
    data: { role: "ADMIN" },
  });

  await snapshot("СОСТОЯНИЕ ПОСЛЕ");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
