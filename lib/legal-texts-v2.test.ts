// Юридические тексты v2: единая галочка оплаты, якоря, содержимое страниц, цифры планов, срок хранения.
// DB-часть (запись согласия) — DB_TESTS=1.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, after } from "node:test";

import { LEGAL_DOCS } from "@/lib/legal-content";
import { legalSlug } from "@/lib/legal-slug";
import { OVER_LIMIT_FEE_MDL, PLAN_LIMITS, AGENCY_SEAT_FEE_MDL, SINGLE_ACCESS_FEE_MDL } from "@/lib/plan-limits";
import { PAYMENT_RETENTION_YEARS } from "@/lib/payment-config";
import {
  AGENCY_TOPUP_CONSENT_VERSION,
  ONE_TIME_CONSENT_VERSION,
  PAYMENT_TERMS_HREF,
  RECURRING_CONSENT_VERSION,
  RETURN_POLICY_HREF,
  SERVICE_CONSENT_TEXT,
  SERVICE_CONSENT_VERSION,
} from "@/lib/recurring-consent";
import { checkServiceConsent, csConsentError } from "@/lib/service-consent";

const read = (p: string) => readFileSync(p, "utf8");
const allText = (k: keyof typeof LEGAL_DOCS) => LEGAL_DOCS[k].blocks.map((b) => b.text).join("\n");
const h2s = (k: keyof typeof LEGAL_DOCS) => LEGAL_DOCS[k].blocks.filter((b) => b.t === "h2").map((b) => b.text);

describe("галочка оплаты: текст и якоря", () => {
  it("текст дословно по финальной редакции юриста (24.11.2026)", () => {
    assert.equal(
      SERVICE_CONSENT_TEXT,
      "Sunt de acord să primesc serviciul digital imediat după achitare și confirm că am citit și accept Condițiile de plată, Termenii de returnare și Termenii publicați pe site.",
    );
  });
  it("компонент ServiceConsentLabel даёт тот же текст, ссылки на /termeni", () => {
    const src = read("components/ServiceConsentLabel.tsx");
    const rendered = src
      .slice(src.indexOf("<span>"), src.indexOf("</span>"))
      .replace(/<[^>]+>/g, "")
      .replace(/\{" "\}/g, " ")
      .replace(/\s+/g, " ")
      .replace("<span>", "")
      .trim();
    assert.equal(rendered, SERVICE_CONSENT_TEXT);
    assert.match(src, /PAYMENT_TERMS_HREF/);
    assert.match(src, /RETURN_POLICY_HREF/);
    assert.match(src, /href="\/termeni"/);
  });
  it("якоря ссылок совпадают с id заголовков /termeni", () => {
    const ids = h2s("termeni").map(legalSlug);
    // «Condițiile de plată» и «Termenii de returnare» → один раздел «Plată și rambursare».
    assert.equal(PAYMENT_TERMS_HREF, "/termeni#plata-si-rambursare");
    assert.equal(RETURN_POLICY_HREF, "/termeni#plata-si-rambursare");
    assert.ok(ids.includes("plata-si-rambursare"));
    assert.ok(!ids.includes("politica-de-returnare"));
    assert.equal(new Set(ids).size, ids.length, "id заголовков уникальны");
  });
  it("во всех платёжных формах единый компонент, старые тексты галочек убраны", () => {
    const files = [
      "app/app/checkout/CheckoutClient.tsx",
      "app/app/pending/PendingTariffs.tsx",
      "app/app/pending/PlanStatus.tsx",
      "app/app/agency/AgencyClient.tsx",
      "app/app/agency/AgencySubscriptionBlock.tsx",
      "app/app/cadastru/page.tsx",
      "app/app/_components/flow/steps/Step2Upload.tsx",
    ];
    for (const f of files) {
      const s = read(f);
      assert.match(s, /<ServiceConsentLabel \/>/, f);
      assert.doesNotMatch(s, /Sunt de acord cu\{" "\}/, f);
      assert.doesNotMatch(s, /name="agreedToTerms" value="true"/, `${f}: нельзя жёстко подставлять согласие`);
    }
    for (const f of files.slice(1)) assert.match(read(f), /<ServiceConsentVersionField \/>/, f);
    assert.match(read("app/app/checkout/CheckoutClient.tsx"), /serviceConsentVersion: SERVICE_CONSENT_VERSION/);
  });
});

describe("серверная проверка согласия", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("VB: без формы / без галочки → 400", () => {
    for (const f of [null, form({}), form({ agreedToTerms: "false", termsVersion: SERVICE_CONSENT_VERSION })]) {
      const r = checkServiceConsent(f);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.response.status, 400);
    }
  });
  it("VB: галочка есть, версия отсутствует/устарела → 409", () => {
    for (const f of [form({ agreedToTerms: "true" }), form({ agreedToTerms: "true", termsVersion: "old" })]) {
      const r = checkServiceConsent(f);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.response.status, 409);
    }
  });
  it("VB: галочка и актуальная версия → ok", () => {
    assert.equal(checkServiceConsent(form({ agreedToTerms: "true", termsVersion: SERVICE_CONSENT_VERSION })).ok, true);
  });
  it("все четыре VB-роута вызывают checkServiceConsent и recordOneTimeConsent", () => {
    for (const r of ["vb-initiate", "vb-agency-initiate", "vb-overage-initiate", "vb-single-access-initiate"]) {
      const s = read(`app/api/payments/${r}/route.ts`);
      assert.match(s, /checkServiceConsent\(form\)/, r);
      assert.match(s, /recordOneTimeConsent\(/, r);
    }
  });
  const ok = { agreedToTerms: true, agreedToRecurring: true, serviceConsentVersion: SERVICE_CONSENT_VERSION, consentVersion: RECURRING_CONSENT_VERSION };
  it("CS: полное тело → null", () => {
    assert.equal(csConsentError(ok, RECURRING_CONSENT_VERSION), null);
    assert.equal(csConsentError({ ...ok, consentVersion: AGENCY_TOPUP_CONSENT_VERSION }, AGENCY_TOPUP_CONSENT_VERSION), null);
  });
  it("CS: нет галочки → 400; нет/старая версия сервиса → 409; старая версия автосписания → 409", () => {
    assert.equal(csConsentError({ ...ok, agreedToTerms: false }, RECURRING_CONSENT_VERSION)?.status, 400);
    assert.equal(csConsentError({ ...ok, agreedToRecurring: undefined }, RECURRING_CONSENT_VERSION)?.status, 400);
    const { serviceConsentVersion: _omit, ...noVer } = ok;
    void _omit;
    assert.equal(csConsentError(noVer, RECURRING_CONSENT_VERSION)?.status, 409);
    assert.equal(csConsentError({ ...ok, serviceConsentVersion: "old" }, RECURRING_CONSENT_VERSION)?.status, 409);
    assert.equal(csConsentError({ ...ok, consentVersion: "old" }, RECURRING_CONSENT_VERSION)?.status, 409);
  });
  it("capture-context пишет serviceTextVersion, использует csConsentError", () => {
    const s = read("app/api/payments/cs/capture-context/route.ts");
    assert.match(s, /csConsentError\(body, expectedVersion\)/);
    assert.match(s, /serviceTextVersion: SERVICE_CONSENT_VERSION/);
  });
});

describe("тексты страниц v2", () => {
  it("Termeni: новые разделы есть, «Plată și rambursare» — финальный текст юриста, дубль «Politica de returnare» удалён", () => {
    const t = h2s("termeni");
    for (const h of [
      "Abonament, tarife și plăți",
      "Furnizarea serviciului și acordul la plată",
      "Reînnoirea automată (debitare recurentă)",
      "Anularea abonamentului",
      "Schimbarea planului",
      "Abonamentul agenției (HUB/Agenție)",
      "Eșecul plății",
      "Ștergerea contului",
      "Plată și rambursare",
    ]) assert.ok(t.includes(h), h);
    assert.ok(!t.includes("Politica de returnare"));
    const all = allText("termeni");
    assert.doesNotMatch(all, /14 zile/, "старое право отказа 14 дней удалено");
    assert.doesNotMatch(all, /Politica de returnare/);
    for (const lead of ["Plată.", "Serviciu digital furnizat imediat.", "Rambursări datorate.", "Cereri.", "Creditarea sumelor.", "Dezactivarea abonamentului.", "Persoane juridice."])
      assert.ok(LEGAL_DOCS.termeni.blocks.some((b) => b.t === "p" && b.text.startsWith(lead)), lead);
    assert.match(all, /dreptul de retragere prevăzut pentru contractele la distanță nu se mai aplică serviciului digital/);
    assert.match(all, /Furnizorul răspunde în termen de 5 zile lucrătoare/);
    // Grace-период (неоплата) отличается от добровольной деактивации.
    assert.match(all, /Accesul se păstrează 5 zile după sfârșitul perioadei plătite/);
    assert.doesNotMatch(all, /după data scadentă/);
    assert.match(all, /La dezactivare în cursul unei perioade deja achitate, accesul continuă până la finalul acesteia/);
    assert.match(allText("termeni"), /Sunt de acord să primesc serviciul digital imediat după achitare/);
  });
  it("Termeni: конфликт возврата закрыт, TODO снят", () => {
    assert.doesNotMatch(read("lib/legal-content.ts"), /TODO\(legal\)/);
    assert.doesNotMatch(read("lib/legal-content.ts"), /АВТОГЕНЕРАЦИЯ/);
  });
  it("Politică: платёжные данные, транзакции, CyberSource, 6 лет, IP/user-agent согласия", () => {
    const p = allText("confidentialitate");
    assert.match(p, /Date de plată:/);
    assert.match(p, /Date de securitate și jurnal de audit/);
    assert.match(p, /CyberSource \/ Visa Acceptance Solutions/);
    assert.match(p, /Victoriabank \(acquirer\)/);
    assert.match(p, /transfer transfrontalier/);
    assert.match(p, new RegExp(`${PAYMENT_RETENTION_YEARS} ani de la data plății`));
    assert.match(p, /adresa IP și user-agent-ul, ca dovadă a acordului/);
    assert.match(p, /Jurnalul de audit se păstrează 12 luni/);
    assert.match(p, /Ștergerea contului este disponibilă direct în Aplicație/);
  });
  it("Politică и «Ștergerea contului»: запись платежей — имя, телефон, IP, описание; IP не пишется при автосписании", () => {
    const p = allText("confidentialitate");
    assert.match(p, /descrierea serviciului plătit, numărul comenzii, identificatorii tranzacției, numele, numărul de telefon și e-mailul plătitorului, precum și adresa IP de pe care a fost inițiată plata/);
    assert.match(p, /nu se actualizează la modificarea ulterioară a profilului/);
    assert.match(p, /La plățile lunare automate, efectuate fără participarea dumneavoastră, adresa IP nu se înregistrează\./);
    assert.match(p, /Data ultimei actualizări: 26\.11\.2026/);
    const t = allText("termeni");
    assert.match(t, /descrierea serviciului, numele, numărul de telefon și e-mailul plătitorului, adresa IP din momentul plății\) se păstrează 6 ani/);
    assert.ok(!/\(suma, data, tipul plății, e-mailul/.test(p + t), "старая формулировка не осталась");
  });
  it("нет служебных пометок и устаревшего срока", () => {
    for (const k of ["termeni", "confidentialitate", "faq"] as const) {
      const t = allText(k);
      assert.doesNotMatch(t, /provizoriu|de completat|\*\*|\b2 ani\b/, k);
      assert.match(t, /./);
    }
    assert.match(allText("termeni"), /Data ultimei actualizări: 24\.11\.2026/);
    assert.match(allText("confidentialitate"), /Data ultimei actualizări: 26\.11\.2026/);
  });
  it("FAQ: все вопросы раздела C и цифры планов = plan-limits", () => {
    const faq = allText("faq");
    for (const q of ["Se reînnoiește abonamentul automat?", "Cum anulez abonamentul?", "Pot primi banii înapoi?", "De ce trebuie să bifez caseta înainte de plată?", "Ce se întâmplă dacă debitarea este respinsă?", "Cum schimb cardul?", "Cum trec la alt plan?", "Cum funcționează abonamentul agenției?", "Cum șterg contul?"]) assert.ok(faq.includes(q), q);
    const line = (name: string) => LEGAL_DOCS.faq.blocks.find((b) => b.t === "li" && b.text.startsWith(name))!.text;
    const b = PLAN_LIMITS.BASIC, p = PLAN_LIMITS.PRO, h = PLAN_LIMITS.HUB;
    assert.match(line("Basic"), new RegExp(`cadastrală ${b.CADASTRU_CHECK}/lună.*dosarului ${b.DOSAR_ANALYSIS}/lună.*${b.OBIECTE_ACTIVE} de obiecte active simultan.*Creator Hub ${b.CREATOR_HUB}`));
    assert.match(line("Pro"), new RegExp(`dosarului ${p.DOSAR_ANALYSIS}/lună.*Creator Hub ${p.CREATOR_HUB}/lună.*Anunțuri 999 ${p.ANUNT_999}/lună`));
    assert.match(line("HUB"), new RegExp(`${AGENCY_SEAT_FEE_MDL} MDL/loc.*dosarului ${h.DOSAR_ANALYSIS}/lună.*Creator Hub ${h.CREATOR_HUB}/lună.*Anunțuri 999 ${h.ANUNT_999}/lună`));
    assert.match(faq, new RegExp(`O accesare \\(${SINGLE_ACCESS_FEE_MDL} MDL`));
    const f = OVER_LIMIT_FEE_MDL;
    assert.match(line("Peste limită"), new RegExp(`Basic ${f.BASIC.DOSAR_ANALYSIS} MDL, Pro ${f.PRO.DOSAR_ANALYSIS} MDL, HUB ${f.HUB.DOSAR_ANALYSIS} MDL.*Basic \\(${f.BASIC.CADASTRU_CHECK} MDL\\)`));
  });
  it("тарифная страница: «20 simultan», строка про автопродление", () => {
    const s = read("app/app/pending/PendingTariffs.tsx");
    assert.match(s, /Obiectele mele — 20 simultan/);
    assert.doesNotMatch(s, /Obiectele mele — 20\/lună/);
    assert.match(s, /Abonamentele se reînnoiesc automat lunar\. Anulare oricând din profil\. Prețurile nu includ TVA\./);
  });
});

describe("срок хранения платежей", () => {
  it("PAYMENT_RETENTION_YEARS = 6, «2 года» убраны из delete-user", () => {
    assert.equal(PAYMENT_RETENTION_YEARS, 6);
    const s = read("lib/delete-user.ts");
    assert.doesNotMatch(s, /хранятся 2 года|п\. 3\.2\.5/);
    assert.match(s, /PAYMENT_RETENTION_YEARS/);
  });
});

describe("RecurringConsent.serviceTextVersion (DB)", { skip: process.env.DB_TESTS !== "1" && "DB_TESTS!=1" }, () => {
  const ids: { user?: string; payment?: string } = {};
  after(async () => {
    const { prisma } = await import("@/lib/prisma");
    if (ids.payment) await prisma.recurringConsent.deleteMany({ where: { paymentId: ids.payment } });
    if (ids.payment) await prisma.payment.deleteMany({ where: { id: ids.payment } });
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });
  it("recordOneTimeConsent: ONE_TIME + версия сервиса + сумма, ip/user-agent из запроса", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { recordOneTimeConsent } = await import("@/lib/service-consent");
    const u = await prisma.user.create({ data: { email: `lt-${Date.now()}@vbtest.local`, name: "lt", passwordHash: "x" } });
    ids.user = u.id;
    const pay = await prisma.payment.create({ data: { order: String(Date.now()).slice(-9) + "7", userId: u.id, plan: "BASIC", amount: "30.00", purpose: "SINGLE_ACCESS" } });
    ids.payment = pay.id;
    const req = new Request("https://x.test/", { method: "POST", headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "test-agent" } });
    await recordOneTimeConsent({ request: req, userId: u.id, paymentId: pay.id, amount: "30.00", currency: "MDL" });
    const row = await prisma.recurringConsent.findFirst({ where: { paymentId: pay.id } });
    assert.equal(row?.textVersion, ONE_TIME_CONSENT_VERSION);
    assert.equal(row?.serviceTextVersion, SERVICE_CONSENT_VERSION);
    assert.equal(row?.amount, "30.00");
    assert.equal(row?.ip, "203.0.113.5");
    assert.equal(row?.userAgent, "test-agent");
  });
});
