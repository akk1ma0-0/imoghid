import { clientIp } from "@/lib/http-meta";

// Данные плательщика для записи транзакции (договор с банком): имя, телефон, IP, описание.
// Снимок на момент создания Payment — хранится вместе с платёжной записью (PAYMENT_RETENTION_YEARS)
// и НЕ обнуляется при удалении аккаунта (см. lib/delete-user.ts). Без паролей, токенов и данных карты.
export type PayerFields = {
  payerName: string | null;
  payerPhone: string | null;
  payerIp: string | null;
  description: string | null;
};

const cut = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

// request = null → платёж инициирован продавцом (автосписание MIT): IP клиента нет → payerIp null.
export function payerSnapshot(args: {
  user: { name: string | null; phone: string | null };
  request: Request | null;
  description: string | null;
}): PayerFields {
  return {
    payerName: cut(args.user.name, 200),
    payerPhone: cut(args.user.phone, 32),
    payerIp: args.request ? cut(clientIp(args.request), 64) : null,
    description: cut(args.description, 300),
  };
}
