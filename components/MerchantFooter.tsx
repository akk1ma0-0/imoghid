import Link from "next/link";

import { MERCHANT } from "@/lib/merchant";
import { PaymentCards } from "@/components/PaymentCards";

// Общий футер с реквизитами продавца, контактами поддержки и логотипами карт (требование банка):
// главная, тарифы, checkout, вход/регистрация, юридические страницы. Серверный компонент без
// состояния. Данные — только из lib/merchant.ts.
const LINKS = [
  { href: "/despre", label: "Despre ImoGhid" },
  { href: "/termeni", label: "Termeni și Condiții" },
  { href: "/confidentialitate", label: "Politică de confidențialitate" },
  { href: "/faq", label: "Întrebări frecvente" },
];

export function MerchantFooter({ className, showLinks = true }: { className?: string; showLinks?: boolean }) {
  const m = MERCHANT;
  return (
    <footer className={`merchant-foot${className ? ` ${className}` : ""}`} data-testid="merchant-footer">
      {showLinks && (
        <nav className="merchant-foot-nav" aria-label="Documente">
          {LINKS.map((l, i) => (
            <span key={l.href}>
              {i > 0 && <span className="sep"> · </span>}
              <Link href={l.href}>{l.label}</Link>
            </span>
          ))}
        </nav>
      )}
      <div className="merchant-foot-legal">
        © 2026 {m.legalName} · IDNO {m.idno}
        <br />
        {m.address}
      </div>
      <div className="merchant-foot-contact">
        Tel. <a href={`tel:${m.phone.replace(/\s/g, "")}`}>{m.phone}</a> ·{" "}
        <a href={`mailto:${m.email}`}>{m.email}</a>
        <br />
        Suport: {m.supportHours}
      </div>
      <PaymentCards style={{ marginTop: 10 }} />
    </footer>
  );
}
