// Логотипы принимаемых карт (Visa/Mastercard). Ассеты — public/visa.svg,
// public/mastercard.svg (заменяемы на официальные бренд-файлы под теми же именами).
// Размер — ТОЛЬКО по высоте, ширина auto: масштабируется корректно под реальный
// aspect-ratio каждого файла (оба SVG теперь с viewBox), без искажений и привязки
// к пропорциям конкретного логотипа.
const cardStyle: React.CSSProperties = {
  height: 22,
  width: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
};

export function PaymentCards({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      aria-label="Metode de plată acceptate"
      style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 14, ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/visa.svg" alt="Visa" style={cardStyle} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mastercard.svg" alt="Mastercard" style={cardStyle} />
    </div>
  );
}
