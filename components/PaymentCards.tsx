// Логотипы принимаемых карт (Visa/Mastercard). Ассеты — public/visa.svg,
// public/mastercard.svg (заменяемы на официальные бренд-файлы под теми же именами).
// Размер задаём инлайн-CSS (height+width явно) — SVG-as-<img> с одним лишь height
// ненадёжно масштабируется в некоторых браузерах (WebKit/iOS).
const cardStyle: React.CSSProperties = {
  height: 20,
  width: 30, // ~соотношение viewBox 131.39×86.9
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
