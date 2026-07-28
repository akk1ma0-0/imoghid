import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PendingTariffs } from "./PendingTariffs";

// Точка решения «тарифы vs waitlist» — серверный компонент (Node runtime).
// WAITLIST_MODE читается на КАЖДОМ запросе (не инлайнится на билде, как в edge-middleware),
// поэтому переключение флага применяется сразу на следующем запросе — без обязательного
// Redeploy специально ради флага. Middleware сюда направляет всех plan-null пользователей.
export default async function PendingPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  // Точечный обход waitlist для тестовых аккаунтов (напр. тест платежей при активной
  // рекламной кампании). Список email в WAITLIST_BYPASS_EMAILS (через запятую).
  const email = session?.user?.email?.toLowerCase() ?? "";
  const bypassEmails = (process.env.WAITLIST_BYPASS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const bypassWaitlist = isAdmin || (email !== "" && bypassEmails.includes(email));

  // Waitlist-режим: не-админ без плана (и не в списке обхода) → страница «ждите приглашение».
  if (process.env.WAITLIST_MODE === "true" && !bypassWaitlist) {
    redirect("/app/waitlist");
  }

  // Иначе — тарифы (или ручная активация админом).
  return <PendingTariffs />;
}
