import { NextResponse } from "next/server";

import { recordExport } from "@/lib/audit";
import { requireAuditAccess } from "@/lib/audit-auth";
import { EXPORT_MAX_ROWS } from "@/lib/audit-config";
import {
  adminSheet,
  cadastruSheet,
  capRows,
  consumSheets,
  loginSheet,
  sheetRowCount,
  workbookBuffer,
  type Sheet,
} from "@/lib/audit-export";
import {
  parseJurnalParams,
  queryAdminLog,
  queryCadastru,
  queryLogins,
  queryUsageByDay,
  queryUsageByUser,
} from "@/lib/audit-queries";

export const maxDuration = 30;

// GET /api/admin/jurnal/export?type=…&from=…&to=…&q=… → .xlsx. Доступ: ADMIN и AUDITOR (роль из БД).
// Лимит строк EXPORT_MAX_ROWS (больше → 413: сузьте период). Каждая выгрузка пишется в AuditEvent (EXPORT);
// если запись не удалась — файл НЕ отдаётся (выгрузка без следа недопустима).
export async function GET(request: Request) {
  const guard = await requireAuditAccess();
  if ("response" in guard) return guard.response;

  const p = await parseJurnalParams(new URL(request.url).searchParams);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });

  // limit = MAX+1: так отличаем «ровно MAX» от «больше MAX» без отдельного count.
  const all = { page: 1, limit: EXPORT_MAX_ROWS + 1 };
  let sheets: Sheet[];
  let overflow = false;
  switch (p.type) {
    case "login": {
      const c = capRows((await queryLogins(p.filter, all)).rows, EXPORT_MAX_ROWS);
      overflow = c.overflow;
      sheets = loginSheet(c.rows);
      break;
    }
    case "cadastru": {
      const c = capRows((await queryCadastru(p.filter, all)).rows, EXPORT_MAX_ROWS);
      overflow = c.overflow;
      sheets = cadastruSheet(c.rows);
      break;
    }
    case "admin": {
      const c = capRows((await queryAdminLog(p.filter, all)).rows, EXPORT_MAX_ROWS);
      overflow = c.overflow;
      sheets = adminSheet(c.rows);
      break;
    }
    case "consum": {
      const [byDay, byUser] = await Promise.all([queryUsageByDay(p.filter), queryUsageByUser(p.filter)]);
      overflow = byDay.length > EXPORT_MAX_ROWS || byUser.length > EXPORT_MAX_ROWS;
      sheets = consumSheets(byDay, byUser);
      break;
    }
  }
  if (overflow) {
    return NextResponse.json(
      { error: `Prea multe rânduri (peste ${EXPORT_MAX_ROWS}). Restrângeți perioada sau filtrați după utilizator.` },
      { status: 413 },
    );
  }

  const rows = sheetRowCount(sheets);
  const logged = await recordExport({
    actorId: guard.userId,
    exportType: p.type,
    rows,
    from: p.fromYmd,
    to: p.toYmd,
    userFilter: p.hasUser,
  });
  if (!logged) {
    return NextResponse.json({ error: "Jurnalul de audit nu este disponibil; exportul a fost anulat." }, { status: 503 });
  }

  const buf = workbookBuffer(sheets);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="jurnal-${p.type}-${p.fromYmd}_${p.toYmd}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
