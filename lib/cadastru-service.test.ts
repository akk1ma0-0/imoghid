// Кадастр: повторные попытки к коннектору (без сети — fetch подменён), requestId повторов
// и трактовка пустого Rights (AGE: «нет данных о правах» ≠ «нет обременений»).
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  FLAG_EXISTS,
  FLAG_NONE,
  FLAG_UNKNOWN,
  lookupCadastru,
  mapRealEstate,
  rightsHaveNoData,
} from "@/lib/cadastru-service";

const CAD = "0100109.159.02.001";
const RID_RE = /^[0-9a-fA-F-]{8,64}$/; // валидатор requestId на стороне коннектора
const BASE_ID = "3f1c2a9e-5b7d-4c1a-9e0f-1234567890ab";

const OK_BODY = {
  mode: "live",
  data: { CadastralNumber: CAD, Area: "58.40", Rights: [{ HasInterdictions: false, HasNotations: false, HasOtherRights: false, Quota: "1/1" }] },
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const err = (status: number, code: string) => json(status, { error: { code } });

type Step = Response | Error | "hang";
const realFetch = globalThis.fetch;
let calls: { rid: string }[] = [];
let sleeps: number[] = [];
let clock = 0;
const opts = () => ({
  sleep: async (ms: number) => {
    sleeps.push(ms);
    clock += ms;
  },
  now: () => clock,
});

function mockFetch(steps: Step[]) {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls.push({ rid: JSON.parse(String(init?.body)).requestId });
    const s = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (s === "hang") {
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      });
    }
    if (s instanceof Error) throw s;
    return s.clone();
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  sleeps = [];
  clock = 0;
  process.env.CONNECTOR_URL = "https://connector.test/get-real-estate";
  process.env.CONNECTOR_AUTH_TOKEN = "t";
  delete process.env.CONNECTOR_TIMEOUT_MS;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("повторы: временные сбои", () => {
  it("TIMEOUT (504) → успех со второй попытки; пауза 1 с; rid с суффиксом", async () => {
    mockFetch([err(504, "TIMEOUT"), json(200, OK_BODY)]);
    const r = await lookupCadastru(CAD, BASE_ID, opts());
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    assert.deepEqual(sleeps, [1000]);
    assert.deepEqual(calls.map((c) => c.rid), [BASE_ID, `${BASE_ID}-2`]);
  });

  it("два UNREACHABLE подряд → третья попытка; паузы 1 с и 3 с", async () => {
    mockFetch([err(503, "UNREACHABLE"), err(503, "UNREACHABLE"), json(200, OK_BODY)]);
    const r = await lookupCadastru(CAD, BASE_ID, opts());
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 3);
    assert.deepEqual(sleeps, [1000, 3000]);
    assert.deepEqual(calls.map((c) => c.rid), [BASE_ID, `${BASE_ID}-2`, `${BASE_ID}-3`]);
  });

  it("три сбоя подряд → ошибка, 3 обращения (1 + 2 повтора), после последнего паузы нет", async () => {
    mockFetch([err(504, "TIMEOUT")]);
    const r = await lookupCadastru(CAD, BASE_ID, opts());
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "TIMEOUT");
    assert.equal(r.attempts, 3);
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [1000, 3000]);
  });

  it("сетевой отказ до коннектора (fetch бросает) → повтор, итог UNREACHABLE", async () => {
    mockFetch([new TypeError("fetch failed")]);
    const r = await lookupCadastru(CAD, BASE_ID, opts());
    assert.equal(r.ok === false && r.code, "UNREACHABLE");
    assert.equal(calls.length, 3);
  });

  it("наш таймаут (abort) → TIMEOUT и повтор", async () => {
    process.env.CONNECTOR_TIMEOUT_MS = "15";
    mockFetch(["hang", json(200, OK_BODY)]);
    const r = await lookupCadastru(CAD, BASE_ID, opts());
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
  });

  it("5xx без кода коннектора (nginx 502, не JSON) → повтор", async () => {
    mockFetch([new Response("<html>Bad Gateway</html>", { status: 502 }), json(200, OK_BODY)]);
    const r = await lookupCadastru(CAD, BASE_ID, opts());
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
  });
});

describe("повторы: окончательные ответы НЕ повторяем (ровно одно обращение)", () => {
  const finals: [string, Response, string][] = [
    ["NOT_FOUND (404)", err(404, "NOT_FOUND"), "NOT_FOUND"],
    ["INVALID_INPUT (400)", err(400, "INVALID_INPUT"), "INVALID_INPUT"],
    ["WSSEC (503 с кодом)", err(503, "WSSEC"), "WSSEC"],
    ["UNAUTHORIZED (401)", err(401, "UNAUTHORIZED"), "UNAUTHORIZED"],
    ["SOAP_FAULT (502 с кодом)", err(502, "SOAP_FAULT"), "SOAP_FAULT"],
    ["404 без кода", new Response("nope", { status: 404 }), "NOT_FOUND"],
    ["200 без данных (нарушение контракта)", json(200, { mode: "live", data: null }), "SOAP_FAULT"],
  ];
  for (const [name, res, code] of finals) {
    it(name, async () => {
      mockFetch([res, json(200, OK_BODY)]);
      const r = await lookupCadastru(CAD, BASE_ID, opts());
      assert.equal(r.ok, false);
      assert.equal(r.ok === false && r.code, code);
      assert.equal(r.attempts, 1);
      assert.equal(calls.length, 1);
      assert.deepEqual(sleeps, []);
    });
  }

  it("невалидный номер в сеть не уходит", async () => {
    mockFetch([json(200, OK_BODY)]);
    const r = await lookupCadastru("abc", BASE_ID, opts());
    assert.equal(r.ok === false && r.code, "INVALID_INPUT");
    assert.equal(calls.length, 0);
  });
});

describe("бюджет времени", () => {
  it("повтор только если пауза + таймаут попытки укладываются в остаток", async () => {
    // таймаут попытки 10 с; бюджет 12 с: 1-я пауза (0+1+10=11) проходит, 2-я (1+3+10=14) — нет.
    mockFetch([err(504, "TIMEOUT")]);
    const r = await lookupCadastru(CAD, BASE_ID, { ...opts(), budgetMs: 12_000 });
    assert.equal(r.attempts, 2);
    assert.deepEqual(sleeps, [1000]);
  });
  it("бюджет меньше паузы + таймаута — повторов нет вовсе", async () => {
    mockFetch([err(504, "TIMEOUT")]);
    const r = await lookupCadastru(CAD, BASE_ID, { ...opts(), budgetMs: 5_000 });
    assert.equal(r.attempts, 1);
    assert.deepEqual(sleeps, []);
  });
});

describe("requestId повторов", () => {
  it("суффиксы проходят regex коннектора для настоящего UUID", async () => {
    const id = crypto.randomUUID();
    mockFetch([err(504, "TIMEOUT")]);
    await lookupCadastru(CAD, id, opts());
    assert.equal(calls.length, 3);
    for (const c of calls) assert.match(c.rid, RID_RE);
    assert.deepEqual(calls.map((c) => c.rid), [id, `${id}-2`, `${id}-3`]);
  });
});

describe("Rights: пусто = «нет данных», а не «нет обременений»", () => {
  const re = (rights: unknown) => ({ CadastralNumber: CAD, Rights: rights as never });
  const R = (a: boolean | null, b: boolean | null, c: boolean | null) => ({
    HasInterdictions: a,
    HasNotations: b,
    HasOtherRights: c,
    Quota: "1/1",
  });

  it("Rights пуст: rightsNoData, флаги неизвестны (не «Nu există»)", () => {
    const m = mapRealEstate(re([]));
    assert.equal(m.rightsNoData, true);
    assert.deepEqual([m.dr, m.not, m.int], [FLAG_UNKNOWN, FLAG_UNKNOWN, FLAG_UNKNOWN]);
  });
  it("Rights отсутствует: то же", () => {
    const m = mapRealEstate({ CadastralNumber: CAD });
    assert.equal(m.rightsNoData, true);
    assert.deepEqual([m.dr, m.not, m.int], [FLAG_UNKNOWN, FLAG_UNKNOWN, FLAG_UNKNOWN]);
  });
  it("Right без одного признака (null): rightsNoData, «Nu există» не выводится ни по одному пункту", () => {
    const m = mapRealEstate(re([R(false, null, false)]));
    assert.equal(m.rightsNoData, true);
    assert.deepEqual([m.dr, m.not, m.int], [FLAG_UNKNOWN, FLAG_UNKNOWN, FLAG_UNKNOWN]);
  });
  it("Right без признака (поле undefined, старый формат) тоже = нет данных", () => {
    assert.equal(rightsHaveNoData([{ HasInterdictions: false, Quota: "1/1" }]), true);
  });
  it("все признаки явно false: «Nu există», данных достаточно", () => {
    const m = mapRealEstate(re([R(false, false, false)]));
    assert.equal(m.rightsNoData, false);
    assert.deepEqual([m.dr, m.not, m.int], [FLAG_NONE, FLAG_NONE, FLAG_NONE]);
  });
  it("есть true: «Există» (даже если у другого Right данных нет — предупреждение не скрываем)", () => {
    const m = mapRealEstate(re([R(true, false, false), R(null, null, null)]));
    assert.equal(m.int, FLAG_EXISTS);
    assert.equal(m.rightsNoData, true);
  });
  it("два Right, все false → titulari считается, rightsNoData=false", () => {
    const m = mapRealEstate(re([R(false, false, false), R(false, false, false)]));
    assert.equal(m.rightsNoData, false);
    assert.match(m.titulari ?? "", /2 titulari/);
  });
});
