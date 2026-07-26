import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WaitlistPanel } from "./WaitlistPanel";

// Waitlist-заглушка (перед публичным запуском). Гейт — в middleware по WAITLIST_MODE.
// Язык берём из БД (User.locale, default "ro") — чтобы сохранялся между входами.
export default async function WaitlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { locale: true },
  });
  const locale = user?.locale === "ru" ? "ru" : "ro";

  return <WaitlistPanel initialLocale={locale} />;
}
