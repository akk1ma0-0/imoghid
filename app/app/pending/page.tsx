import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSingleAccessSummary, getUsageSummary } from "@/lib/usage";
import { getPlanDisplay } from "@/lib/plan-display";
import { personalPlanPurchaseBlock } from "@/lib/agency";
import { isWaitlistedFromEnv } from "@/lib/waitlist";
import { PendingTariffs } from "./PendingTariffs";
import { PlanStatus } from "./PlanStatus";

// Точка решения «тарифы vs waitlist» — серверный компонент (Node runtime).
// Страница ПУБЛИЧНАЯ (SIP — банк требует доступную без логина страницу цен):
//   • Анонимный посетитель → видит тарифы, кнопки ведут на /register.
//   • Залогинен, plan = null → как раньше: WAITLIST_MODE решает тарифы vs /app/waitlist.
//   • Залогинен, есть план → в приложение.
// WAITLIST_MODE читается на КАЖДОМ запросе (не инлайнится на билде, как в edge-middleware),
// поэтому переключение флага применяется сразу на следующем запросе — без Redeploy.
export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const isAuthed = !!session?.user;
  const sp = await searchParams;
  const changeRequested = sp.change === "1";

  if (isAuthed) {
    // До подтверждения e-mail — на шаг подтверждения (как в middleware до этой правки).
    if (!session!.user.emailConfirmed) {
      redirect("/app/verify-email-pending");
    }
    const userId = session!.user.id;
    const plan = session!.user.plan;
    // Причина, по которой личный Basic/Pro купить нельзя (участник / владелец активного
    // агентства), — то же правило, что в vb-initiate; null = можно.
    const personalBlock = await personalPlanPurchaseBlock(userId);

    // Смена личного плана (Basic/Pro): тарифы в режиме change=1 — баннер о замене, без блока
    // кода приглашения. HUB сюда не попадает: участник сначала выходит из агентства, а
    // владелец управляет HUB со страницы /app/agency (владельцу change=1 тоже не открываем).
    if (plan && changeRequested && (plan === "BASIC" || plan === "PRO") && !personalBlock) {
      return <PendingTariffs isAuthenticated changeMode />;
    }

    // Уже есть план → показываем статус плана и использование лимитов (а не выбор тарифа).
    if (plan) {
      // План/срок/роль — общее правило (lib/plan-display.ts), то же, что в /app/profile.
      const [summary, display] = await Promise.all([
        getUsageSummary(userId),
        getPlanDisplay(userId, session!.user.role),
      ]);

      return (
        <PlanStatus
          plan={plan}
          kind={display.kind}
          planExpiresAt={display.expiresAt}
          agencyExpiresAt={display.agencyExpiresAt}
          rows={summary.rows}
          singleAccessCount={summary.singleAccessCount}
          personalPlanBlockedMsg={personalBlock}
        />
      );
    }

    // Разовые доступы («O accesare») без плана: индикатор над тарифами.
    const singleAccess = await getSingleAccessSummary(userId);

    // Waitlist-режим: не-админ без плана (и не в списке обхода WAITLIST_BYPASS_EMAILS) →
    // «ждите приглашение». Правило — lib/waitlist.ts (то же, что в профиле). Пользователь с
    // неиспользованным грантом уже допущен в приложение (middleware) и обратно с
    // /app/waitlist возвращается на /app, поэтому его на waitlist не отправляем — иначе
    // страница тарифов и индикатор были бы для него недостижимы.
    if (singleAccess.total === 0 && isWaitlistedFromEnv({ role: session!.user.role, email: session!.user.email })) {
      redirect("/app/waitlist");
    }

    // Без плана, но владелец активного агентства (место себе не брал) — личный Basic/Pro
    // недоступен: вместо кнопок оплаты в карточках показываем причину.
    return <PendingTariffs isAuthenticated personalPlanBlockedMsg={personalBlock} singleAccess={singleAccess} />;
  }

  // Тарифы. Для анонимного посетителя кнопки ведут на регистрацию (без формы оплаты).
  return <PendingTariffs isAuthenticated={isAuthed} />;
}
