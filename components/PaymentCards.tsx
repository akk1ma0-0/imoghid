// Логотипы принимаемых карт (Visa/Mastercard). Ассеты — public/visa.svg,
// public/mastercard.svg (заменяемы на официальные бренд-файлы под теми же именами).
export function PaymentCards({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      aria-label="Metode de plată acceptate"
      style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 14, ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/visa.svg" alt="Visa" height={22} style={{ border: "1px solid #e5e7eb", borderRadius: 4 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mastercard.svg" alt="Mastercard" height={22} style={{ border: "1px solid #e5e7eb", borderRadius: 4 }} />
    </div>
  );
}
