import Link from "next/link";

// Дружелюбная 404 вместо стандартной Next. Без авто-редиректа — явная кнопка.
// (Частый источник таких урлов — blob:https://…/UUID от скачивания на iOS, у которого
//  потерялась схема blob: — см. lib/download-file.ts.)
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f8f9fa",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "#111827",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 18,
            margin: "0 auto 18px",
            letterSpacing: "-0.02em",
          }}
        >
          IG
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 8 }}>404</div>
        <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 10 }}>Pagina nu a fost găsită</h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
          Adresa accesată nu există sau nu mai este disponibilă. Dacă ați ajuns aici după ce ați
          descărcat un fișier de pe telefon, acel link (blob) este temporar și nu poate fi deschis
          din nou.
        </p>
        <Link
          href="/app"
          style={{
            display: "inline-block",
            background: "#1d4ed8",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            padding: "10px 20px",
            borderRadius: 8,
          }}
        >
          Înapoi la ImoGhid →
        </Link>
      </div>
    </div>
  );
}
