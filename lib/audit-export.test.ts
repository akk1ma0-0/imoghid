// Выгрузка XLSX: защита от формул, фиксированные колонки без чувствительных полей, лимит строк. Без БД.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSXns from "xlsx-js-style";

import { adminSheet, cadastruSheet, capRows, consumSheets, loginSheet, sanitizeCell, sheetRowCount, workbookBuffer } from "@/lib/audit-export";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX: any = (XLSXns as any).default ?? XLSXns;
const readBack = (buf: Buffer) => XLSX.read(buf, { type: "buffer" });
const aoa = (wb: { Sheets: Record<string, unknown> }, name: string): unknown[][] =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });

describe("защита от формул (Excel-инъекция)", () => {
  it("значения, начинающиеся с = + - @ или табуляции, получают префикс", () => {
    for (const bad of ["=1+1", "+1", "-2", "@SUM(A1)", "\t=1", '=HYPERLINK("http://evil","x")']) {
      assert.equal(sanitizeCell(bad), `'${bad}`, bad);
    }
    assert.equal(sanitizeCell("Ana Pop"), "Ana Pop");
    assert.equal(sanitizeCell(42), 42);
    assert.equal(sanitizeCell(null), "");
    assert.equal(sanitizeCell(undefined), "");
  });

  it("в файле имя «=1+1» — обычный текст, а не формула", () => {
    const buf = workbookBuffer(loginSheet([{ at: "2026-11-17 10:00:00", user: "a@x.test", name: "=1+1", result: "Intrare reușită" }]));
    const wb = readBack(buf);
    const cell = wb.Sheets["Intrări"]["C2"];
    assert.equal(cell.t, "s");
    assert.equal(cell.f, undefined);
    assert.equal(cell.v, "'=1+1");
  });
});

describe("содержимое файла", () => {
  it("кадастр: фиксированные колонки и значения", () => {
    const buf = workbookBuffer(
      cadastruSheet([{ at: "2026-11-17 15:50:39", user: "a@x.test", name: "Ana", cadastralNo: "0100109.159.02.001", result: "OK", attempts: 2, ms: 1893, requestId: "rid-1" }]),
    );
    const rows = aoa(readBack(buf), "Verificări cadastrale");
    assert.deepEqual(rows[0], ["Data și ora (Chișinău)", "Utilizator", "Nume", "Număr cadastral", "Rezultat", "Încercări", "ms", "ID cerere"]);
    assert.deepEqual(rows[1], ["2026-11-17 15:50:39", "a@x.test", "Ana", "0100109.159.02.001", "OK", 2, 1893, "rid-1"]);
  });

  it("потребление: два листа (по дням и по пользователям) с итогами", () => {
    const buf = workbookBuffer(
      consumSheets(
        [{ day: "2026-11-17", counts: { CADASTRU_CHECK: 2 }, total: 2 }],
        [{ user: "a@x.test", name: "Ana", counts: { CADASTRU_CHECK: 2, DOSAR_ANALYSIS: 1 }, total: 3 }],
      ),
    );
    const wb = readBack(buf);
    assert.deepEqual(wb.SheetNames, ["Pe zile", "Pe utilizatori"]);
    assert.equal(aoa(wb, "Pe zile")[1][1], 2);
    assert.equal(aoa(wb, "Pe utilizatori")[1].at(-1), 3);
  });

  it("ни в одном заголовке нет паролей, токенов, IP и user-agent", () => {
    const sheets = [
      ...loginSheet([]), ...cadastruSheet([]), ...adminSheet([]), ...consumSheets([], []),
    ];
    const headers = sheets.flatMap((s) => s.header).join("|").toLowerCase();
    assert.ok(!/pass|parol|token|secret|user-?agent|\bip\b|hash/.test(headers), headers);
  });

  it("пустая выгрузка — валидный файл", () => {
    const wb = readBack(workbookBuffer(adminSheet([])));
    assert.deepEqual(aoa(wb, "Acțiuni admin").length, 1); // только заголовок
    assert.equal(sheetRowCount(adminSheet([])), 0);
  });
});

describe("лимит строк", () => {
  it("ровно MAX — не превышение; MAX+1 — превышение и обрезка", () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    assert.deepEqual(capRows(rows, 10), { rows, overflow: false });
    const over = capRows([...rows, 10], 10);
    assert.equal(over.overflow, true);
    assert.equal(over.rows.length, 10);
  });
});
