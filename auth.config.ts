import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";
import type { SubscriptionPlan } from "@prisma/client";

import { decideAppAccess } from "@/lib/auth-access";

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
      // Mod Demo — интерактивный тур (моковые данные, без реальных API). Доступ к /app/*
      // без сессии, если установлен cookie demo (или ?demo=true при первом переходе).
      const isDemo =
        request.cookies.get("imo_demo")?.value === "1" ||
        nextUrl.searchParams.get("demo") === "true";
      const u = auth?.user;
      // Само решение — чистая функция lib/auth-access.ts (покрыта тестами): verify-email → план/
      // грант/агентство → /app/pending; AUDITOR без плана → только журнал. Флаг WAITLIST_MODE здесь
      // НЕ читается (edge инлайнит env на билде) — решает Node-слой страницы /app/pending.
      const d = decideAppAccess({
        pathname: nextUrl.pathname,
        isDemo,
        user: u
          ? {
              emailConfirmed: !!u.emailConfirmed,
              plan: u.plan,
              hasSingleAccess: !!u.hasSingleAccess,
              isAgencyOwner: !!u.isAgencyOwner,
              role: u.role,
            }
          : null,
      });
      switch (d.kind) {
        case "allow":
          return true;
        case "login":
          // false → NextAuth редиректит на pages.signIn (/login)
          return false;
        case "redirect":
          return Response.redirect(new URL(d.to, nextUrl));
        case "allow-pending": {
          // /app/pending открыта и анонимным (SIP: публичная страница цен). Путь пробрасываем в
          // заголовок, чтобы серверный гейт /app-лейаута тоже её пропустил.
          const headers = new Headers(request.headers);
          headers.set("x-pathname", nextUrl.pathname);
          return NextResponse.next({ request: { headers } });
        }
      }
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
        token.hasSingleAccess = user.hasSingleAccess;
        token.isAgencyOwner = user.isAgencyOwner;
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
      session.user.hasSingleAccess = token.hasSingleAccess ?? false;
      session.user.isAgencyOwner = token.isAgencyOwner ?? false;
      return session;
    },
  },
} satisfies NextAuthConfig;
