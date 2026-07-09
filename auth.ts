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
          select: { sessionVersion: true },
        });
        // Токены, выпущенные до появления sessionVersion, не имеют claim → трактуем как 0
        // (значение по умолчанию), чтобы деплой не разлогинил всех разом. Инкремент при
        // смене e-mail (0 → 1) всё равно инвалидирует такие токены.
        const tokenVer = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
        if (!dbUser || dbUser.sessionVersion !== tokenVer) {
          return null;
        }
      }
      return token;
    },
  },
});
