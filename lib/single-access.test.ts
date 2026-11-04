import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accessesAvailableText,
  emptySingleAccess,
  singleAccessBreakdown,
  singleAccessBreakdownText,
  summarizeSingleAccess,
} from "@/lib/single-access";

const used = new Date("2026-11-01T10:00:00Z");
const g = (feature: string, consumedAt: Date | null = null) => ({ feature, consumedAt });

describe("подсчёт неиспользованных разовых доступов", () => {
  it("пакет «O accesare»: 3 гранта → total 3, по одному на функцию", () => {
    const s = summarizeSingleAccess([g("CADASTRU_CHECK"), g("DOSAR_ANALYSIS"), g("OBIECTE_CREATE")]);
    assert.deepEqual(s, { total: 3, byFeature: { CADASTRU_CHECK: 1, DOSAR_ANALYSIS: 1, OBIECTE_CREATE: 1 } });
  });
  it("два пакета → по 2; использованные не считаются", () => {
    const s = summarizeSingleAccess([
      g("CADASTRU_CHECK"), g("DOSAR_ANALYSIS"), g("OBIECTE_CREATE"),
      g("CADASTRU_CHECK"), g("DOSAR_ANALYSIS", used), g("OBIECTE_CREATE", used),
    ]);
    assert.equal(s.total, 4);
    assert.deepEqual(s.byFeature, { CADASTRU_CHECK: 2, DOSAR_ANALYSIS: 1, OBIECTE_CREATE: 1 });
  });
  it("всё использовано / нет грантов → total 0 (плашки нет)", () => {
    assert.deepEqual(summarizeSingleAccess([g("CADASTRU_CHECK", used)]), emptySingleAccess());
    assert.deepEqual(summarizeSingleAccess([]), emptySingleAccess());
  });
  it("неизвестная функция учитывается в total (как раньше), но не в разбивке", () => {
    const s = summarizeSingleAccess([g("CREATOR_HUB"), g("CADASTRU_CHECK")]);
    assert.equal(s.total, 2);
    assert.deepEqual(s.byFeature, { CADASTRU_CHECK: 1, DOSAR_ANALYSIS: 0, OBIECTE_CREATE: 0 });
  });
});

describe("разбивка и тексты", () => {
  it("только функции с остатком, в порядке пакета", () => {
    const s = summarizeSingleAccess([g("OBIECTE_CREATE"), g("CADASTRU_CHECK"), g("CADASTRU_CHECK")]);
    assert.deepEqual(singleAccessBreakdown(s).map((b) => [b.feature, b.count]), [["CADASTRU_CHECK", 2], ["OBIECTE_CREATE", 1]]);
    assert.equal(singleAccessBreakdownText(s), "verificări cadastrale: 2 · obiecte: 1");
  });
  it("полный пакет — три подписи по-румынски", () => {
    const s = summarizeSingleAccess([g("CADASTRU_CHECK"), g("DOSAR_ANALYSIS"), g("OBIECTE_CREATE")]);
    assert.equal(singleAccessBreakdownText(s), "verificări cadastrale: 1 · examinări dosar: 1 · obiecte: 1");
  });
  it("пусто → пустая строка", () => {
    assert.equal(singleAccessBreakdownText(emptySingleAccess()), "");
  });
  it("форма слова «acces»", () => {
    assert.equal(accessesAvailableText(1), "1 acces disponibil");
    assert.equal(accessesAvailableText(3), "3 accese disponibile");
    assert.equal(accessesAvailableText(6), "6 accese disponibile");
  });
});
