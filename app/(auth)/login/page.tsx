import { MerchantFooter } from "@/components/MerchantFooter";
import { LoginForm } from "./LoginForm";

// Серверная обёртка: форма и реквизиты продавца попадают в HTML без JS (требование банка).
// callbackUrl читается на сервере. Middleware передаёт абсолютный URL — берём только путь и query
// (хост отбрасывается: защита от open redirect); не путь → /app.
function safeCallback(raw: string): string {
  if (!raw) return "/app";
  try {
    const u = new URL(raw, "http://x.invalid");
    const path = u.pathname + u.search;
    return path.startsWith("/") && !path.startsWith("//") ? path : "/app";
  } catch {
    return "/app";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "";
  const callbackUrl = safeCallback(raw);
  return <LoginForm callbackUrl={callbackUrl} footer={<MerchantFooter className="compact" showLinks={false} />} />;
}
