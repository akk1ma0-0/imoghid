// IP и user-agent клиента — для записей согласия (RecurringConsent).
export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : request.headers.get("x-real-ip")) || null;
}

export function consentMeta(request: Request): { ip: string | null; userAgent: string | null } {
  return { ip: clientIp(request), userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500) || null };
}
