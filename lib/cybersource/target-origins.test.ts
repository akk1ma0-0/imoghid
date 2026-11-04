import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTargetOrigins } from "@/lib/cybersource/target-origins";

const branch = "imoghid-git-plan-change-imoghid.vercel.app";
const client = "imoghid-git-cs-client-imoghid.vercel.app";
const explicit = `https://${client}`;

describe("buildTargetOrigins", () => {
  it("preview: явный список + origin текущей ветки", () => {
    assert.deepEqual(buildTargetOrigins({ explicit, vercelEnv: "preview", branchUrl: branch }), [explicit, `https://${branch}`]);
  });
  it("preview: ветка уже в явном списке — без дубля", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: `https://${branch}/`, vercelEnv: "preview", branchUrl: branch }), [`https://${branch}`]);
  });
  it("preview без VERCEL_BRANCH_URL — только явный список", () => {
    assert.deepEqual(buildTargetOrigins({ explicit, vercelEnv: "preview" }), [explicit]);
  });
  it("production: только явный список, ветка не добавляется", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: "https://imoghid.md", vercelEnv: "production", branchUrl: branch }), ["https://imoghid.md"]);
  });
  it("локально (VERCEL_ENV не задан) и development: только явный список", () => {
    assert.deepEqual(buildTargetOrigins({ explicit: "https://localhost:3000", branchUrl: branch }), ["https://localhost:3000"]);
    assert.deepEqual(buildTargetOrigins({ explicit: "https://localhost:3000", vercelEnv: "development", branchUrl: branch }), ["https://localhost:3000"]);
  });
  it("формат: http, маски, пути, мусор отбрасываются", () => {
    assert.deepEqual(
      buildTargetOrigins({ explicit: "http://a.md, https://*.vercel.app, https://b.md/path, https://c.md?x=1, ,https://ok.md:8443/" }),
      ["https://ok.md:8443"],
    );
  });
  it("preview: некорректное значение ветки (схема, путь, маска) не попадает в список", () => {
    for (const bad of ["https://x.vercel.app", "x.vercel.app/path", "*.vercel.app", "a b.vercel.app"]) {
      assert.deepEqual(buildTargetOrigins({ vercelEnv: "preview", branchUrl: bad }), []);
    }
  });
  it("пустое окружение — пустой список", () => {
    assert.deepEqual(buildTargetOrigins({}), []);
  });
});
