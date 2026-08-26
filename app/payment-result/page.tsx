import { auth } from "@/auth";
import { Providers } from "@/components/Providers";
import { PostPaymentEntry } from "@/components/PostPaymentEntry";

// BACKREF — страница, куда браузер возвращается после оплаты. Активацию плана НЕ делаем
// (это server-to-server callback /api/payments/vb-callback, как требует банк). Но при КАЖДОЙ
// загрузке (включая перезагрузку) делаем свежую серверную проверку доступа через auth() —
// jwt-wrapper перечитывает plan/hasSingleAccess из БД. Если доступ уже есть (callback успел
// отработать), передаём initialActive=true — клиент освежает cookie одним update() и уходит в /app,
// не начиная слепой поллинг заново. Прямой redirect('/app') здесь НЕ годится: RSC не может
// перевыпустить JWT-cookie, и edge-middleware увидит устаревший plan=null → отбросит на /app/pending.
export const dynamic = "force-dynamic";

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const order = typeof sp.ORDER === "string" ? sp.ORDER : undefined;

  const session = await auth();
  const alreadyActive = !!(
    session?.user?.plan ||
    session?.user?.hasSingleAccess ||
    session?.user?.isAgencyOwner
  );

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
        <Providers>
          <PostPaymentEntry initialActive={alreadyActive} />
        </Providers>
      </div>
    </div>
  );
}
