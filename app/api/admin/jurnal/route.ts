import { NextResponse } from "next/server";

import { requireAuditAccess } from "@/lib/audit-auth";
import {
  defaultPage,
  parseJurnalParams,
  queryAdminLog,
  queryCadastru,
  queryLogins,
  queryUsageByDay,
  queryUsageByUser,
} from "@/lib/audit-queries";
import { JURNAL_PAGE_SIZE } from "@/lib/audit-config";

// GET /api/admin/jurnal?type=login|cadastru|consum|admin&from=YYYY-MM-DD&to=YYYY-MM-DD&q=<e-mail>&page=N
// Доступ: ADMIN и AUDITOR (роль из БД). Только чтение.
export async function GET(request: Request) {
  const guard = await requireAuditAccess();
  if ("response" in guard) return guard.response;

  const p = await parseJurnalParams(new URL(request.url).searchParams);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });

  const meta = { type: p.type, from: p.fromYmd, to: p.toYmd, page: p.page, pageSize: JURNAL_PAGE_SIZE };
  const opts = defaultPage(p.page);
  switch (p.type) {
    case "login":
      return NextResponse.json({ ...meta, ...(await queryLogins(p.filter, opts)) });
    case "cadastru":
      return NextResponse.json({ ...meta, ...(await queryCadastru(p.filter, opts)) });
    case "admin":
      return NextResponse.json({ ...meta, ...(await queryAdminLog(p.filter, opts)) });
    case "consum": {
      const [byDay, byUser] = await Promise.all([queryUsageByDay(p.filter), queryUsageByUser(p.filter)]);
      return NextResponse.json({ ...meta, byDay, byUser });
    }
  }
}
