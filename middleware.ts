import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe middleware: использует только authConfig (без Prisma/bcrypt).
// Логика защиты — в callbacks.authorized.
export default NextAuth(authConfig).auth;

export const config = {
  // Защищаем /app/*. Логин/регистрация/подписка доступны без сессии.
  matcher: ["/app/:path*"],
};
