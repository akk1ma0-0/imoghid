import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTargetOrigins, extraExplicitOrigins, parseExplicitOrigins } from "@/lib/cybersource/target-origins";

const branch = "imoghid-git-plan-change-imoghid.vercel.app";
const client = "https://imoghid-git-cs-client-imoghid.vercel.app";
const both = `${client},https://${branch}`;

describe("buildTargetOrigins — в UC уходит ровно один origin", () => {
  it("preview: только origin ветки, явный список (даже из двух адресов) игнорируется", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: both, vercelEnv: "preview", branchUrl: branch }), [`https://${branch}`]);
    assert.deepEqual(buildTargetOrigins({ explicit: client, vercelEnv: "preview", branchUrl: branch }), [`https://${branch}`]);
  });
  it("preview без VERCEL_BRANCH_URL — первый валидный из явного списка", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: both, vercelEnv: "preview" }), [client]);
    assert.deepEqual(buildTargetOrigins({ explicit: `http://bad.md, ${client}`, vercelEnv: "preview", branchUrl: "  " }), [client]);
  });
  it("preview: некорректный VERCEL_BRANCH_URL (схема, путь, маска) → запасной вариант из явного списка", () => {
    for (const bad of ["https://x.vercel.app", "x.vercel.app/path", "*.vercel.app", "a b.vercel.app"]) {
      assert.deepEqual(buildTargetOrigins({ explicit: client, vercelEnv: "preview", branchUrl: bad }), [client]);
      assert.deepEqual(buildTargetOrigins({ vercelEnv: "preview", branchUrl: bad }), []);
    }
  });
  it("production: первый валидный из явного списка, ветка не используется", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: "https://imoghid.md", vercelEnv: "production", branchUrl: branch }), ["https://imoghid.md"]);
    assert.deepEqual(buildTargetOrigins({ explicit: "https://imoghid.md, https://www.imoghid.md", vercelEnv: "production" }), ["https://imoghid.md"]);
  });
  it("локально и development: первый валидный из явного списка", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: "https://localhost:3000", branchUrl: branch }), ["https://localhost:3000"]);
    assert.deepEqual(buildTargetOrigins({ explicit: "https://localhost:3000,https://b.md", vercelEnv: "development", branchUrl: branch }), ["https://localhost:3000"]);
  });
  it("формат: http, маски, пути, query, мусор пропускаются — берётся первый валидный", () => {
    assert.deepEqual(
      buildTargetOrigins({ explicit: "http://a.md, https://*.vercel.app, https://b.md/path, https://c.md?x=1, ,https://ok.md:8443/, https://second.md" }),
      ["https://ok.md:8443"],
    );
  });
  it("нет валидных origin'ов — пустой массив (вызывающий вернёт ошибку конфигурации)", () => {
    assert.deepEqual(buildTargetOrigins({}), []);
    assert.deepEqual(buildTargetOrigins({ explicit: "http://a.md,*" }), []);
    assert.deepEqual(buildTargetOrigins({ vercelEnv: "production", branchUrl: branch }), []);
  });
  it("длина результата всегда 0 или 1", () => {
    const envs = [
      { explicit: both, vercelEnv: "preview", branchUrl: branch },
      { explicit: both, vercelEnv: "preview" },
      { explicit: both, vercelEnv: "production", branchUrl: branch },
      { explicit: both },
      { explicit: "", vercelEnv: "preview", branchUrl: branch },
    ];
    for (const e of envs) assert.ok(buildTargetOrigins(e).length <= 1);
  });
});

describe("parseExplicitOrigins / extraExplicitOrigins", () => {
  it("парсинг: запятые, trim, хвостовой слэш, дедуп", () => {
    assert.deepEqual(parseExplicitOrigins(` ${client}/ , ${client}, https://b.md `), [client, "https://b.md"]);
    assert.deepEqual(parseExplicitOrigins(undefined), []);
  });
  it("production/локально: лишние — всё после первого валидного (для предупреждения)", () => {
    assert.deepEqual(extraExplicitOrigins({ explicit: both, vercelEnv: "production" }), [`https://${branch}`]);
    assert.deepEqual(extraExplicitOrigins({ explicit: client }), []);
  });
  it("preview с origin'ом ветки — предупреждать не о чем; без него — как в production", () => {
    assert.deepEqual(extraExplicitOrigins({ explicit: both, vercelEnv: "preview", branchUrl: branch }), []);
    assert.deepEqual(extraExplicitOrigins({ explicit: both, vercelEnv: "preview" }), [`https://${branch}`]);
  });
});
