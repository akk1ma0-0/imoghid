import { PAYMENT_TERMS_HREF, RETURN_POLICY_HREF, SERVICE_CONSENT_VERSION } from "@/lib/recurring-consent";

// Текст обязательной галочки оплаты (то же, что SERVICE_CONSENT_TEXT) со ссылками. Менять
// формулировку — только вместе с SERVICE_CONSENT_TEXT/версией (тест сверяет их).
export function ServiceConsentLabel() {
  return (
    <span>
      Sunt de acord să primesc serviciul digital imediat după achitare și confirm că am citit și accept{" "}
      <a href={PAYMENT_TERMS_HREF} target="_blank" rel="noopener noreferrer">Condițiile de plată</a>,{" "}
      <a href={RETURN_POLICY_HREF} target="_blank" rel="noopener noreferrer">Termenii de returnare</a> și{" "}
      <a href="/termeni" target="_blank" rel="noopener noreferrer">Termenii</a> publicați pe site.
    </span>
  );
}

// Скрытое поле версии для HTML-форм VictoriaBank (рядом с agreedToTerms).
export function ServiceConsentVersionField() {
  return <input type="hidden" name="termsVersion" value={SERVICE_CONSENT_VERSION} />;
}
