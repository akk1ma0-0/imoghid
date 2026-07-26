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

  // Waitlist-режим: не-админ без плана → страница «ждите приглашение».
  if (process.env.WAITLIST_MODE === "true" && !isAdmin) {
    redirect("/app/waitlist");
  }

  // Иначе — тарифы (или ручная активация админом).
  return <PendingTariffs />;
}
