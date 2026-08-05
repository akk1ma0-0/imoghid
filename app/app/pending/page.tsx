import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PendingTariffs } from "./PendingTariffs";

// Точка решения «тарифы vs waitlist» — серверный компонент (Node runtime).
// Страница ПУБЛИЧНАЯ (SIP — банк требует доступную без логина страницу цен):
//   • Анонимный посетитель → видит тарифы, кнопки ведут на /register.
//   • Залогинен, plan = null → как раньше: WAITLIST_MODE решает тарифы vs /app/waitlist.
//   • Залогинен, есть план → в приложение.
// WAITLIST_MODE читается на КАЖДОМ запросе (не инлайнится на билде, как в edge-middleware),
// поэтому переключение флага применяется сразу на следующем запросе — без Redeploy.
export default async function PendingPage() {
  const session = await auth();
  const isAuthed = !!session?.user;

  if (isAuthed) {
    // До подтверждения e-mail — на шаг подтверждения (как в middleware до этой правки).
    if (!session!.user.emailConfirmed) {
      redirect("/app/verify-email-pending");
    }
    // Уже есть план → в приложение.
    if (session!.user.plan) {
      redirect("/app");
    }

    // Точечный обход waitlist для тестовых аккаунтов (напр. тест платежей при активной
    // рекламной кампании). Список email в WAITLIST_BYPASS_EMAILS (через запятую).
    const isAdmin = session!.user.role === "ADMIN";
    const email = session!.user.email?.toLowerCase() ?? "";
    const bypassEmails = (process.env.WAITLIST_BYPASS_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const bypassWaitlist = isAdmin || (email !== "" && bypassEmails.includes(email));

    // Waitlist-режим: не-админ без плана (и не в списке обхода) → «ждите приглашение».
    if (process.env.WAITLIST_MODE === "true" && !bypassWaitlist) {
      redirect("/app/waitlist");
    }
  }

  // Тарифы. Для анонимного посетителя кнопки ведут на регистрацию (без формы оплаты).
  return <PendingTariffs isAuthenticated={isAuthed} />;
}
