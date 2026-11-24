// Серверная проверка и запись единой галочки оплаты для потоков VictoriaBank (HTML-формы).
// CyberSource проверяет то же самое в /api/payments/cs/capture-context.
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { consentMeta } from "@/lib/http-meta";
import { ONE_TIME_CONSENT_VERSION, SERVICE_CONSENT_VERSION } from "@/lib/recurring-consent";

export type ConsentCheck = { ok: true } | { ok: false; response: NextResponse };

// Без agreedToTerms=true → 400; со старой/пустой версией текста → 409 (страницу нужно перезагрузить).
export function checkServiceConsent(form: FormData | null): ConsentCheck {
  const agreed = form ? String(form.get("agreedToTerms") ?? "") === "true" : false;
  if (!agreed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Trebuie să bifați acordul privind Condițiile de plată, Termenii de returnare și Termenii pentru a continua plata." },
        { status: 400 },
      ),
    };
  }
  if (String(form!.get("termsVersion") ?? "") !== SERVICE_CONSENT_VERSION) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Textul acordului s-a actualizat. Reîncărcați pagina." }, { status: 409 }),
    };
  }
  return { ok: true };
}

// Запись согласия на разовый платёж VictoriaBank (ip/user-agent — как у остальных согласий).
export async function recordOneTimeConsent(args: {
  request: Request;
  userId: string;
  paymentId: string;
  amount: string;
  currency: string;
}): Promise<void> {
  await prisma.recurringConsent.create({
    data: {
      userId: args.userId,
      paymentId: args.paymentId,
      textVersion: ONE_TIME_CONSENT_VERSION,
      serviceTextVersion: SERVICE_CONSENT_VERSION,
      amount: args.amount,
      currency: args.currency,
      ...consentMeta(args.request),
    },
  });
}

// Проверка тела /api/payments/cs/capture-context: обе галочки, версия текста автосписания и версия
// единой галочки оплаты. null — всё в порядке; иначе статус и сообщение для клиента.
export function csConsentError(
  body: Record<string, unknown>,
  expectedRecurringVersion: string,
): { status: number; error: string } | null {
  if (body.agreedToTerms !== true || body.agreedToRecurring !== true) {
    return { status: 400, error: "Trebuie să bifați ambele acorduri." };
  }
  if (body.serviceConsentVersion !== SERVICE_CONSENT_VERSION) {
    return { status: 409, error: "Textul acordului s-a actualizat. Reîncărcați pagina." };
  }
  if (body.consentVersion !== expectedRecurringVersion) {
    return { status: 409, error: "Textul acordului s-a actualizat. Reîncărcați pagina." };
  }
  return null;
}
