import type { NextAuthConfig } from "next-auth";
import type { SubscriptionPlan } from "@prisma/client";

// Edge-safe конфигурация (без Prisma и bcrypt) — её использует middleware.
// Полный конфиг с провайдером Credentials живёт в auth.ts (Node runtime).
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    // Защита маршрутов. Срабатывает только на путях из matcher (middleware.ts).
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp = nextUrl.pathname.startsWith("/app");

      if (!isOnApp) return true;

      // Нет сессии → false → NextAuth редиректит на pages.signIn (/login)
      if (!isLoggedIn) return false;

      // Сессия есть, но подписка не активна → на страницу выбора плана
      if (!auth!.user.planActive) {
        return Response.redirect(new URL("/subscribe", nextUrl));
      }

      return true;
    },

    // Кладём id/plan/planActive в JWT при логине и обновляем при update().
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.plan = user.plan;
        token.planActive = user.planActive;
        token.role = user.role;
      }
      // Клиент вызывает useSession().update({ plan, planActive }) после /subscribe.
      if (trigger === "update" && session) {
        const patch = session as {
          plan?: SubscriptionPlan;
          planActive?: boolean;
        };
        if (patch.plan) token.plan = patch.plan;
        if (typeof patch.planActive === "boolean") {
          token.planActive = patch.planActive;
        }
      }
      return token;
    },

    // Прокидываем поля из токена в сессию: { id, email, plan, planActive }.
    session({ session, token }) {
      session.user.id = token.id;
      session.user.plan = token.plan;
      session.user.planActive = token.planActive;
      session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
