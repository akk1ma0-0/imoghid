// Пользователь без плана находится в режиме ожидания (waitlist)?
// Единое правило для /app/pending и /app/profile: WAITLIST_MODE=true и пользователь не админ
// и не в списке обхода WAITLIST_BYPASS_EMAILS. Чистая функция — env передаётся аргументами.
export function isWaitlisted(args: {
  waitlistMode: string | undefined;
  role: string | undefined;
  email: string | null | undefined;
  bypassEmails: string | undefined;
}): boolean {
  if (args.waitlistMode !== "true") return false;
  if (args.role === "ADMIN") return false;
  const email = (args.email ?? "").trim().toLowerCase();
  const bypass = (args.bypassEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !(email !== "" && bypass.includes(email));
}

// Вариант с чтением env (серверный код).
export function isWaitlistedFromEnv(user: { role: string | undefined; email: string | null | undefined }): boolean {
  return isWaitlisted({
    waitlistMode: process.env.WAITLIST_MODE,
    role: user.role,
    email: user.email,
    bypassEmails: process.env.WAITLIST_BYPASS_EMAILS,
  });
}
