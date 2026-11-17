import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { isPlanActive } from "@/lib/plan";
import { authConfig } from "@/auth.config";
import { recordLogin, recordLoginFailed } from "@/lib/audit";
import { applyDbUserToToken } from "@/lib/auth-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    // Успешный вход (не обновление сессии): журнал пишет только userId и время. Сбой записи вход не ломает.
    async signIn({ user }) {
      if (user?.id) await recordLogin(user.id);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parolă", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        if (!user) return null;

        // Заблокированный администратором аккаунт не может войти.
        if (user.isBlocked) {
          await recordLoginFailed(user.id, "BLOCKED");
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          // Только для СУЩЕСТВУЮЩЕГО пользователя; без пароля и без введённого email.
          await recordLoginFailed(user.id, "BAD_PASSWORD");
          return null;
        }

        // Доступ в приложение (WAITLIST-гейт) при plan=null: непотраченный single-access
        // грант (Этап C) ИЛИ владение агентством (Этап D — чтобы владелец мог зайти в
        // /app/agency управлять местами/продлить, даже не выделив место себе).
        const [singleAccessCount, ownedAgency] = await Promise.all([
          prisma.singleAccessGrant.count({ where: { userId: user.id, consumedAt: null } }),
          prisma.agency.findUnique({ where: { ownerId: user.id }, select: { id: true } }),
        ]);

        // Возвращаем поля, которые попадут в JWT (jwt callback в auth.config.ts).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          planActive: isPlanActive(user),
          emailConfirmed: !!user.emailVerified,
          role: user.role,
          sessionVersion: user.sessionVersion,
          hasSingleAccess: singleAccessCount > 0,
          isAgencyOwner: !!ownedAgency,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Node-runtime обёртка над базовым jwt: база (edge-safe, auth.config.ts) выставляет поля
    // токена, включая sessionVersion при логине. Здесь для уже существующих сессий сверяем
    // sessionVersion с БД. Рассинхрон (напр. после смены e-mail) → null → сессия
    // инвалидируется на ВСЕХ устройствах. Middleware использует базовый jwt без обращения к БД.
    async jwt(params) {
      const token = await authConfig.callbacks!.jwt!(params);
      if (token && !params.user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            sessionVersion: true,
            email: true,
            // Роль и блокировка — из БД на каждом запросе: понижение админа и блокировка действуют
            // сразу (без ожидания истечения JWT / перелогина).
            role: true,
            isBlocked: true,
            // Освежаем план из БД на каждом запросе: после подписочной оплаты (callback
            // активирует план) сессия сразу отражает его — без релогина; истечение/смена
            // плана тоже применяются немедленно.
            plan: true,
            planActivatedAt: true,
            planExpiresAt: true,
            // «O accesare» (Этап C): аналогично для hasSingleAccess — после покупки грант
            // сразу пускает в приложение, а после траты последнего claim гаснет сам.
            _count: { select: { singleAccessGrants: { where: { consumedAt: null } } } },
            // Этап D: владение агентством (доступ в /app/agency при plan=null).
            ownedAgency: { select: { id: true } },
          },
        });
        // Чистая функция (lib/auth-token.ts, покрыта тестами): null → сессия аннулируется
        // (рассинхрон sessionVersion / заблокирован / удалён); иначе освежает email, роль и план.
        return applyDbUserToToken(token, dbUser && {
          sessionVersion: dbUser.sessionVersion,
          email: dbUser.email,
          role: dbUser.role,
          isBlocked: dbUser.isBlocked,
          plan: dbUser.plan,
          planActive: isPlanActive(dbUser),
          singleAccessCount: dbUser._count.singleAccessGrants,
          ownsAgency: !!dbUser.ownedAgency,
        });
      }
      return token;
    },
  },
});
