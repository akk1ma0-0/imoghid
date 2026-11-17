import { notFound } from "next/navigation";

import { getAuditViewer } from "@/lib/audit-auth";
import { JurnalPanel } from "./JurnalPanel";

// Серверный гард: журнал доступен ADMIN и AUDITOR (роль из БД). Остальным — 404.
export default async function JurnalPage() {
  const viewer = await getAuditViewer();
  if (!viewer) notFound();
  return <JurnalPanel role={viewer.role} />;
}
