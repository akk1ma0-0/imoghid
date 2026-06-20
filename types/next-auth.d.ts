import type { SubscriptionPlan } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Расширяем типы NextAuth, добавляя поля из нашей модели User.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: SubscriptionPlan;
      planActive: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    plan: SubscriptionPlan;
    planActive: boolean;
  }
}

// JWT-интерфейс объявлен в @auth/core/jwt (next-auth/jwt лишь реэкспортирует его),
// поэтому аугментировать нужно исходный модуль.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    plan: SubscriptionPlan;
    planActive: boolean;
  }
}
