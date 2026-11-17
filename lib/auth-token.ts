// Освежение JWT данными из БД (Node runtime; вызывается из jwt-колбэка в auth.ts) — чистая функция.
// Возвращает null → сессия аннулируется (рассинхрон sessionVersion ИЛИ пользователь заблокирован/удалён).
// Роль берётся из БД на каждом запросе: понижение/назначение роли действует сразу, без перелогина.

export type DbAuthUser = {
  sessionVersion: number;
  email: string;
  role: "AGENT" | "ADMIN" | "AUDITOR";
  isBlocked: boolean;
  plan: "BASIC" | "PRO" | "HUB" | null;
  planActive: boolean;
  singleAccessCount: number;
  ownsAgency: boolean;
};

type TokenLike = {
  sessionVersion?: unknown;
  email?: unknown;
  role?: unknown;
  plan?: unknown;
  planActive?: unknown;
  hasSingleAccess?: unknown;
  isAgencyOwner?: unknown;
  [k: string]: unknown;
};

export function applyDbUserToToken<T extends TokenLike>(token: T, db: DbAuthUser | null): T | null {
  if (!db) return null; // пользователь удалён
  if (db.isBlocked) return null; // заблокирован админом → выбиваем существующую сессию
  // Токены без claim sessionVersion трактуем как 0 (деплой не должен разлогинить всех).
  const tokenVer = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
  if (db.sessionVersion !== tokenVer) return null;
  if (token.email !== db.email) token.email = db.email;
  (token as TokenLike).role = db.role;
  (token as TokenLike).plan = db.plan;
  (token as TokenLike).planActive = db.planActive;
  (token as TokenLike).hasSingleAccess = db.singleAccessCount > 0;
  (token as TokenLike).isAgencyOwner = db.ownsAgency;
  return token;
}
