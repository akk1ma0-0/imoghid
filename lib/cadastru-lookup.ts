import { randomUUID } from "node:crypto";

import { CAD_ERROR_TEXT, type CadErrorCode } from "@/lib/cadastru-config";
import {
  lookupCadastru,
  resolveCadastruQuery,
  type CadBuilding,
  type CadRecord,
  type CadSource,
  type TraceStep,
} from "@/lib/cadastru-service";
import { DEMO_CADASTRU_RESULT } from "@/lib/demo-data";
import { releaseUsage, reserveUsage, type UsageResult } from "@/lib/usage";

// Оркестрация кадастровой проверки (роут /api/cadastru/lookup — тонкая обёртка над ней).
// Порядок, закрывающий money leak:
//   1) резолв запроса без сети — невалидный ввод и picker ничего не списывают;
//   2) резерв единицы лимита/гранта (атомарно);
//   3) вызов кадастра;
//   4) успех = получена запись → резерв остаётся списанием; иначе — возврат резерва в finally.
// Demo: только мок, без коннектора, без резерва и без записей в БД.
// requestId уходит в коннектор и в наш лог — по нему сопоставляются логи двух сторон.

export type CadastruOutcome =
  | { kind: "record"; cadastralNo: string; record: CadRecord; trace: TraceStep[]; source: CadSource | "demo" }
  | { kind: "picker"; building: CadBuilding; note: string; trace: TraceStep[] }
  | { kind: "blocked"; usage: Extract<UsageResult, { ok: false }> }
  | { kind: "error"; code: CadErrorCode; title: string; text: string };

type LogCode = CadErrorCode | "OK" | "PICKER" | "BLOCKED" | "DEMO" | "RELEASE_FAILED";

// Лог без персональных данных: только requestId, код и длительность — ни кадастрового
// номера, ни тела ответа, ни идентификатора пользователя.
// WSSEC / UNAUTHORIZED — сломана наша конфигурация (сертификат, токен): error + маркер алерта.
const ALERT_CODES: ReadonlySet<LogCode> = new Set(["WSSEC", "UNAUTHORIZED", "RELEASE_FAILED"]);

function logLookup(requestId: string, code: LogCode, ms: number) {
  if (ALERT_CODES.has(code)) {
    console.error(JSON.stringify({ evt: "cadastru_lookup", requestId, code, ms, alert: "CADASTRU_CONNECTOR" }));
    return;
  }
  const line = JSON.stringify({ evt: "cadastru_lookup", requestId, code, ms });
  if (code === "OK" || code === "PICKER" || code === "DEMO") console.info(line);
  else console.warn(line);
}

function errorOutcome(code: CadErrorCode, title?: string, text?: string): CadastruOutcome {
  return {
    kind: "error",
    code,
    title: title ?? CAD_ERROR_TEXT[code].title,
    text: text ?? CAD_ERROR_TEXT[code].text,
  };
}

export async function runCadastruLookup(args: {
  userId: string;
  query: string;
  isDemo: boolean;
  addressSearch?: boolean; // переопределение ENABLE_ADDRESS_SEARCH (тесты)
}): Promise<CadastruOutcome> {
  const requestId = randomUUID();
  const started = Date.now();
  const done = (code: LogCode) => logLookup(requestId, code, Date.now() - started);

  // 1) Резолв без сети.
  const resolved = resolveCadastruQuery(args.query, { addressSearch: args.addressSearch });
  if (resolved.kind === "error") {
    done(resolved.code);
    return errorOutcome(resolved.code, resolved.title, resolved.text);
  }
  if (resolved.kind === "picker") {
    done("PICKER");
    return { kind: "picker", building: resolved.building, note: resolved.note, trace: resolved.trace };
  }

  // Demo: мок-запись, коннектор не вызывается, лимит не трогается, в БД ничего не пишется.
  if (args.isDemo) {
    const d = DEMO_CADASTRU_RESULT;
    done("DEMO");
    return {
      kind: "record",
      cadastralNo: d.cadastralNo,
      record: { addr: d.addr, supr: d.supr, dest: d.dest, val: d.val, prop: d.prop, dr: d.dr, not: d.not, int: d.int, titulari: null },
      source: "demo",
      trace: [
        { s: "ok", title: "Număr cadastral", val: d.cadastralNo },
        { s: "ok", title: "Înregistrare demonstrativă (demo)" },
      ],
    };
  }

  // 2) Резерв.
  const reserved = await reserveUsage(args.userId, "CADASTRU_CHECK");
  if (!reserved.ok) {
    done("BLOCKED");
    return { kind: "blocked", usage: reserved };
  }

  // 3) Вызов; 4) возврат резерва при любой неудаче — в finally (в т.ч. при исключении).
  let success = false;
  try {
    const result = await lookupCadastru(resolved.cad, requestId);
    if (!result.ok) {
      done(result.code);
      return errorOutcome(result.code);
    }
    success = true;
    done("OK");
    return {
      kind: "record",
      cadastralNo: result.cadastralNo,
      record: result.record,
      trace: resolved.trace,
      source: result.source,
    };
  } finally {
    if (!success) {
      try {
        await releaseUsage(reserved.reservation);
      } catch {
        // Не удалось вернуть резерв — ответ пользователю не ломаем, но сигналим громко.
        logLookup(requestId, "RELEASE_FAILED", Date.now() - started);
      }
    }
  }
}
