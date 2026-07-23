import Link from "next/link";

// BACKREF — страница, куда браузер возвращается после оплаты. ТОЛЬКО отображение.
// Реальная активация плана — в server-to-server callback (/api/payments/vb-callback),
// как явно требует документация банка. Здесь НИЧЕГО не меняем в БД.
export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const order = typeof sp.ORDER === "string" ? sp.ORDER : undefined;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🧾</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Comanda a fost primită</h1>
        <p style={{ fontSize: 14.5, color: "#4b5563", lineHeight: 1.65, marginBottom: 10 }}>
          Vă mulțumim! Am primit comanda dvs.{order ? ` (nr. ${order})` : ""}. Confirmarea plății se
          procesează automat — abonamentul se activează imediat ce banca confirmă tranzacția.
        </p>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
          Dacă planul nu apare imediat, reîmprospătați pagina contului peste câteva momente.
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
            padding: "11px 22px",
            borderRadius: 8,
          }}
        >
          Mergeți la cont →
        </Link>
      </div>
    </div>
  );
}
