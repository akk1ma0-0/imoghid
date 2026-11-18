// Решение о доступе к /app/* — чистая функция (без Next/Prisma; edge-safe), чтобы покрыть тестами.
// auth.config.ts → authorized() лишь переводит решение в NextResponse.
//
// Порядок проверок = прежнему поведению (рефакторинг без изменения логики). Роль на доступ к /app/*
// не влияет (журнал и админ-панель закрывают серверные проверки роли ADMIN). Заблокированный
// пользователь в edge не виден (там нет БД): его токен аннулирует jwt-колбэк в Node
// (lib/auth-token.ts) → сессии нет → тут это «login».

export type AccessUser = {
  emailConfirmed: boolean;
  plan: string | null | undefined;
  hasSingleAccess: boolean;
  isAgencyOwner: boolean;
  role?: string | null;
};

export type AccessInput = {
  pathname: string;
  isDemo: boolean;
  user: AccessUser | null; // null = нет сессии
};

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "allow-pending" } // /app/pending: пропустить, проставив заголовок x-pathname
  | { kind: "login" }
  | { kind: "redirect"; to: string };

export function decideAppAccess(input: AccessInput): AccessDecision {
  const { pathname, isDemo, user } = input;
  if (!pathname.startsWith("/app")) return { kind: "allow" };
  if (isDemo) return { kind: "allow" };
  if (pathname.startsWith("/app/pending")) return { kind: "allow-pending" };
  if (!user) return { kind: "login" };

  const isVerifyPending = pathname.startsWith("/app/verify-email-pending");
  if (!user.emailConfirmed) {
    return isVerifyPending ? { kind: "allow" } : { kind: "redirect", to: "/app/verify-email-pending" };
  }
  if (isVerifyPending) return { kind: "redirect", to: "/app" };

  const isWaitlist = pathname.startsWith("/app/waitlist");
  const isCheckout = pathname.startsWith("/app/checkout");
  const hasAccess = !!user.plan || user.hasSingleAccess || user.isAgencyOwner;

  if (!hasAccess) {
    return isWaitlist || isCheckout ? { kind: "allow" } : { kind: "redirect", to: "/app/pending" };
  }

  if (isWaitlist) return { kind: "redirect", to: "/app" };
  return { kind: "allow" };
}
