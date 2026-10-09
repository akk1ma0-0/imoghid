import { createHmac } from "node:crypto";

// Стабильный псевдоним пользователя для логов внешних вызовов: HMAC-SHA256 от User.id.
// Не раскрывает внутренний ключ БД и не содержит e-mail/имени; пересчитывается по User.id,
// поэтому таблица соответствий не нужна. Секрет — USER_PSEUDONYM_SECRET (fallback: AUTH_SECRET,
// с доменной меткой). Смена секрета меняет все псевдонимы — для логов это приемлемо.
export function userPseudonym(userId: string): string {
  const secret = process.env.USER_PSEUDONYM_SECRET || process.env.AUTH_SECRET || "imoghid-dev";
  const mac = createHmac("sha256", secret).update(`imoghid:user-pseudonym:v1:${userId}`).digest("base64url");
  return `u_${mac.slice(0, 16)}`;
}
