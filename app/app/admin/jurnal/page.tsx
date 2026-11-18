import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { JurnalPanel } from "./JurnalPanel";

// Серверный гард (как у /app/admin): журнал доступен ТОЛЬКО роли ADMIN. Для остальных — notFound()
// (404), чтобы не раскрывать существование раздела. Роль и блокировка освежаются из БД в jwt-колбэке.
export default async function JurnalPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }
  return <JurnalPanel />;
}
