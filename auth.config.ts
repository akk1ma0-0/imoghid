import type { NextAuthConfig } from "next-auth";
import type { SubscriptionPlan } from "@prisma/client";

// 30 дней — сессия живёт после закрытия браузера.
const THIRTY_DAYS = 30 * 24 * 60 * 60;
// secure-cookie только в проде (на localhost по http secure-cookie не передаётся → логин сломался бы).
const useSecureCookies = process.env.NODE_ENV === "production";

// Edge-safe конфигурация (без Prisma и bcrypt) — её использует middleware.
// Полный конфиг с провайдером Credentials живёт в auth.ts (Node runtime).
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS,
  },
  // Персистентная cookie на 30 дней (имя — конвенция Auth.js v5, чтобы существующие сессии не ломались).
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: THIRTY_DAYS,
      },
    },
  },
  providers: [],
  callbacks: {
    // Защита маршрутов. Срабатывает только на путях из matcher (middleware.ts).
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const isOnApp = nextUrl.pathname.startsWith("/app");

      if (!isOnApp) return true;

      // Mod Demo — интерактивный тур (моковые данные, без реальных API). Доступ к /app/*
      // без сессии, если установлен cookie demo (или ?demo=true при первом переходе).
      const isDemo =
        request.cookies.get("imo_demo")?.value === "1" ||
        nextUrl.searchParams.get("demo") === "true";
      if (isDemo) return true;

      // Нет сессии → false → NextAuth редиректит на pages.signIn (/login)
      if (!isLoggedIn) return false;

      // Шаг 1 — подтверждение e-mail. До него не пускаем дальше (в т.ч. на pending-plan).
      const isVerifyPending = nextUrl.pathname.startsWith("/app/verify-email-pending");
      if (!auth!.user.emailConfirmed) {
        return isVerifyPending ? true : Response.redirect(new URL("/app/verify-email-pending", nextUrl));
      }
      // E-mail подтверждён → на странице подтверждения делать нечего.
      if (isVerifyPending) {
        return Response.redirect(new URL("/app", nextUrl));
      }

      const isPending = nextUrl.pathname.startsWith("/app/pending");

      // Без плана (plan = null) → страница ожидания активации администратором.
      if (!auth!.user.plan) {
        return isPending ? true : Response.redirect(new URL("/app/pending", nextUrl));
      }

      // С планом на /app/pending делать нечего — ведём в приложение.
      if (isPending) {
        return Response.redirect(new URL("/app", nextUrl));
      }

      return true;
    },

    // Кладём id/plan/planActive в JWT при логине и обновляем при update().
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.plan = user.plan;
        token.planActive = user.planActive;
        token.emailConfirmed = user.emailConfirmed;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }
      // Клиент вызывает useSession().update({ ... }) после /subscribe или подтверждения e-mail.
      if (trigger === "update" && session) {
        const patch = session as {
          plan?: SubscriptionPlan;
          planActive?: boolean;
          emailConfirmed?: boolean;
        };
        if (patch.plan) token.plan = patch.plan;
        if (typeof patch.planActive === "boolean") {
          token.planActive = patch.planActive;
        }
        if (typeof patch.emailConfirmed === "boolean") {
          token.emailConfirmed = patch.emailConfirmed;
        }
      }
      return token;
    },

    // Прокидываем поля из токена в сессию: { id, email, plan, planActive }.
    session({ session, token }) {
      session.user.id = token.id;
      session.user.plan = token.plan;
      session.user.planActive = token.planActive;
      session.user.emailConfirmed = token.emailConfirmed;
      session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
