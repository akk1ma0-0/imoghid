import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { isPlanActive } from "@/lib/plan";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
        if (user.isBlocked) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // «O accesare» (Этап C): есть ли непотраченный single-access грант → пускать в
        // приложение (WAITLIST-гейт), даже когда plan=null.
        const singleAccessCount = await prisma.singleAccessGrant.count({
          where: { userId: user.id, consumedAt: null },
        });

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
            // «O accesare» (Этап C): освежаем hasSingleAccess из БД на каждом запросе, чтобы
            // после покупки грант сразу пускал в приложение без повторного логина, а после
            // траты последнего гранта claim гас сам собой.
            _count: { select: { singleAccessGrants: { where: { consumedAt: null } } } },
          },
        });
        // Токены, выпущенные до появления sessionVersion, не имеют claim → трактуем как 0
        // (значение по умолчанию), чтобы деплой не разлогинил всех разом. Инкремент
        // (кнопка «выйти со всех устройств») инвалидирует такие токены.
        const tokenVer = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
        if (!dbUser || dbUser.sessionVersion !== tokenVer) {
          return null;
        }
        // Держим e-mail в токене актуальным — после смены e-mail сессия остаётся рабочей
        // и подхватывает новый адрес без повторного входа.
        if (token.email !== dbUser.email) token.email = dbUser.email;
        token.hasSingleAccess = dbUser._count.singleAccessGrants > 0;
      }
      return token;
    },
  },
});
