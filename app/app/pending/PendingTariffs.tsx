"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useDemo } from "@/app/contexts/DemoContext";

// Плашки тарифов (plan = null). Две плашки → оплата VictoriaBank. Ручное назначение
// плана админом остаётся параллельным путём. Показывается, когда WAITLIST_MODE выключен.

type Tariff = {
  plan: "BASIC" | "PRO" | "HUB";
  label: string;
  price: string;
  priceUnit?: string; // единица цены; по умолчанию отдельной строкой под ценой — "/ lună"
  // Цена + единица в ОДНУ строку, меньшим шрифтом (чтобы не переносилось на узких карточках).
  // У HUB — "450 MDL" + "/ loc" рядом, одна строка.
  priceInline?: boolean;
  // Список фич плана. Формат строки: "Denumire — limită"; часть после " — " рендерится
  // справа как лимит, строки без " — " — как фича без лимита.
  features: string[];
  highlight?: boolean;
  // HUB идёт ДРУГИМ флоу: не прямая оплата vb-initiate (как Basic/Pro), а переход на
  // /app/agency (выбор числа мест, минимум 3 → там оплата vb-agency-initiate). Anon → /register.
  agencyCta?: boolean;
  footnote?: string; // мелкая сноска под CTA (у HUB — про договорной тариф)
};

const TARIFFS: Tariff[] = [
  {
    plan: "BASIC",
    label: "Basic",
    price: "300 MDL",
    features: [
      "Verificare cadastrală — 50/lună",
      "Examinarea dosarului — 30/lună",
      "Obiectele mele — 20/lună",
      "Check-list acte",
      "Tipuri de acte ale imobilului",
      "Actele Mele — set complet",
      "Creator Hub — 20 postări/lună",
    ],
  },
  {
    plan: "PRO",
    label: "Pro",
    price: "500 MDL",
    highlight: true,
    features: [
      "Verificare cadastrală — nelimitat",
      "Examinarea dosarului — 60/lună",
      "Obiectele mele — nelimitat",
      "Check-list acte",
      "Tipuri de acte ale imobilului",
      "Actele Mele — set complet",
      "Creator Hub — 60 postări/lună",
      "Anunțuri 999 — 60/lună",
    ],
  },
  {
    plan: "HUB",
    label: "HUB / Agenție",
    price: "450 MDL",
    priceUnit: "/ loc",
    priceInline: true,
    agencyCta: true,
    footnote: "Pentru agenții cu mai mulți utilizatori, tariful poate fi negociat — contactați-ne.",
    features: [
      "Verificare cadastrală — nelimitat",
      "Examinarea dosarului — 70/lună",
      "Obiectele mele — nelimitat",
      "Check-list acte",
      "Tipuri de acte ale imobilului",
      "Actele Mele — set complet",
      "Creator Hub — 70/lună",
      "Anunțuri 999 — 70/lună",
      "Minim 3 locuri",
    ],
  },
];

// Описания фич для popover-подсказок. Ключ — имя фичи до тире (совпадает с левой частью строки
// features). Один справочник на все планы: описание фичи одинаково независимо от плана/лимита.
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  "Verificare cadastrală":
    "Verifică un obiect după numărul cadastral, pe baza informațiilor oficiale din Cadastru, și indică dacă există interdicții, notări sau alte drepturi înregistrate.",
  "Examinarea dosarului":
    "Verificare automată a actelor de proprietate — platforma compară documentele încărcate cu datele din registru și semnalează riscuri înainte de a lua obiectul în lucru.",
  "Obiectele mele":
    "Tabloul de bord cu toate obiectele aflate în lucru — status, etapă și istoric, într-un singur loc.",
  "Check-list acte":
    "Listă completă a documentelor necesare pentru fiecare tip de tranzacție, gata de folosit cu clientul.",
  "Tipuri de acte ale imobilului":
    "Ghid de referință rapidă — ce tip de act dovedește dreptul de proprietate și ce presupune fiecare.",
  "Actele Mele":
    "Șabloane editabile de contracte și documente (garanție de cumpărare, contract de intermediere etc.), personalizabile și descărcabile în Word sau PDF.",
  "Creator Hub":
    "Generare automată de postări pentru Instagram, TikTok și Facebook — text și carusel gata de publicat, pornind de la fotografiile obiectului.",
  "Anunțuri 999":
    "Acces la anunțurile de la proprietari de pe 999.md, pentru a găsi rapid obiecte noi de preluat în lucru.",
  "Minim 3 locuri":
    "La cumpărare alegeți numărul de locuri, minim 3. Unul dintre ele îl puteți ocupa chiar dumneavoastră, imediat. Pentru ceilalți agenți generați din cont coduri de invitație (câte un cod pentru fiecare loc).",
};

// Иконка ⓘ с popover по КЛИКУ (не hover — на мобильных hover нет). Закрытие по повторному клику
// или клику снаружи. Без зависимостей: useState + absolute-div. Стиль — переменные проекта.
function FeatureInfo({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Detalii despre funcție"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          color: open ? "var(--blue, #2563eb)" : "var(--ink4, #9ca3af)",
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            width: 230,
            maxWidth: "70vw",
            padding: "9px 11px",
            background: "var(--sur, #fff)",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.5,
            color: "var(--ink2, #374151)",
            textAlign: "left",
            whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// changeMode — смена личного плана (Basic/Pro) пользователем с активным планом
// (/app/pending?change=1): баннер о замене плана, без блока кода приглашения.
// personalPlanBlockedMsg — личный Basic/Pro купить нельзя (владелец активного агентства без
// места): в карточках Basic/Pro вместо формы оплаты — причина. HUB/«O accesare» не меняются.
export function PendingTariffs({
  isAuthenticated = true,
  changeMode = false,
  personalPlanBlockedMsg = null,
}: {
  isAuthenticated?: boolean;
  changeMode?: boolean;
  personalPlanBlockedMsg?: string | null;
}) {
  const { startDemo } = useDemo();
  const [agreed, setAgreed] = useState(false);

  // Cod de invitație de la agenție (AG-XXXXXX) — același apel ca în app/(auth)/subscribe/page.tsx.
  // Server-ul (POST /api/subscribe) distinge singur codurile de agenție de cele PRO obișnuite.
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [inviteCode, setInviteCode] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function activateInvite() {
    const code = inviteCode.trim();
    if (!code) return;
    setInviteError(null);
    setInvitePending(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(data?.error || "Nu s-a putut activa codul.");
        setInvitePending(false);
        return;
      }
      // Reface JWT-ul ca middleware-ul /app să vadă imediat planul activ.
      await updateSession({ plan: data.plan, planActive: true });
      router.push("/app");
      router.refresh();
    } catch {
      setInviteError("Eroare de rețea. Încercați din nou.");
      setInvitePending(false);
    }
  }

  // Оболочка расширена до 1200px, чтобы 3 карточки тарифов были заметно шире (контент ~1148px →
  // ~372px на карточку, список фич не сжат). Остальной контент (интро, «O accesare», demo) сам
  // сужен обратно до 720px через maxWidth + margin auto, чтобы не растягиваться на всю ширину.
  return (
    <div className="ig-page" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginTop: 32, marginBottom: 8, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {changeMode ? "Schimbați planul" : isAuthenticated ? "Alegeți un plan" : "Planuri și prețuri"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6 }}>
          {changeMode
            ? "Alegeți noul plan. Plata este procesată securizat de VictoriaBank."
            : isAuthenticated
              ? "Activați abonamentul pentru a începe. Plata este procesată securizat de VictoriaBank."
              : "Creați un cont pentru a activa un abonament. Plata este procesată securizat de VictoriaBank."}
        </p>
      </div>

      {/* Смена плана: предупреждение о замене текущего плана и пересчёте периода. */}
      {changeMode && (
        <div className="notice amber" style={{ maxWidth: 720, margin: "14px auto 0" }}>
          <div className="notice-dot" />
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <b>
              Planul curent va fi înlocuit după plată. Perioada se calculează din nou, 30 de zile de la
              data plății, fără recalculare pentru perioada rămasă.
            </b>
            <div style={{ marginTop: 6 }}>
              <Link href="/app/pending" style={{ color: "var(--blue, #2563eb)" }}>
                ← Înapoi la abonament
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Согласие с условиями оплаты/возврата — обязательно до перехода на страницу банка (SIP п.7).
          Только для залогиненных (у анонимного оплаты нет — он идёт на регистрацию). */}
      {isAuthenticated && (
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          maxWidth: 560,
          margin: "18px auto 0",
          fontSize: 13,
          color: "var(--ink2)",
          lineHeight: 1.55,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <span>
          Sunt de acord cu{" "}
          <Link href="/termeni" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #2563eb)" }}>
            Termenii și Condițiile de plată
          </Link>{" "}
          și cu{" "}
          <Link href="/termeni" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #2563eb)" }}>
            Politica de returnare
          </Link>
          .
        </span>
      </label>
      )}

      <div
        style={{
          display: "grid",
          // Оболочка .ig-page расширена до 1200px (padding 26 по бокам → контент ~1148px). minmax
          // min=240px — это порог переноса: при 1fr карточки растягиваются до ~372px (3 шт),
          // а на узких экранах auto-fit сам сворачивает ряд в 2 → 1 колонку (адаптив сохранён).
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          alignItems: "stretch",
          gap: 16,
          marginTop: 16,
        }}
      >
        {TARIFFS.map((t) => (
          <div
            key={t.plan}
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              // .card задаёт overflow:hidden — переопределяем, иначе popover-подсказки обрежутся.
              overflow: "visible",
              ...(t.highlight ? { borderColor: "var(--blue, #2563eb)" } : {}),
            }}
          >
            <div
              className="card-bd"
              style={{ padding: "24px 22px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column" }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t.label}
              </div>
              {t.priceInline ? (
                // Цена + единица в одну строку, меньшим шрифтом — не переносится на узких карточках.
                <div style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 4px", whiteSpace: "nowrap" }}>
                  {t.price}{" "}
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink3)" }}>{t.priceUnit}</span>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 30, fontWeight: 700, margin: "8px 0 4px" }}>{t.price}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>{t.priceUnit ?? "/ lună"}</div>
                </>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 18px", textAlign: "left" }}>
                {t.features.map((f) => {
                  const i = f.indexOf(" — ");
                  const name = i >= 0 ? f.slice(0, i) : f;
                  const limit = i >= 0 ? f.slice(i + 3) : null;
                  const desc = FEATURE_DESCRIPTIONS[name];
                  return (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        padding: "7px 0",
                        borderTop: "1px solid var(--line, #eef0f2)",
                      }}
                    >
                      <span style={{ color: "var(--ink2)", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {name}
                        {name === "Anunțuri 999" && <span className="soon-badge">în curând</span>}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {limit && (
                          <span style={{ color: "var(--ink3)", fontWeight: 600, whiteSpace: "nowrap" }}>{limit}</span>
                        )}
                        {desc && <FeatureInfo text={desc} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* Нижний блок карточки: marginTop:auto прижимает CTA (+сноску) к низу, чтобы
                  разная высота контента (priceNote/footnote/список фич) не смещала кнопки. */}
              <div style={{ marginTop: "auto" }}>
                {t.agencyCta ? (
                  // HUB: не прямая оплата — переход на /app/agency (выбор мест, min 3) / регистрация.
                  <Link
                    href={isAuthenticated ? "/app/agency" : "/register"}
                    className={t.highlight ? "btn solid" : "btn"}
                    style={{ width: "100%", justifyContent: "center", height: 44 }}
                  >
                    {isAuthenticated ? "Cumpără locuri" : "Înregistrează-te"}
                  </Link>
                ) : isAuthenticated && personalPlanBlockedMsg ? (
                  <p style={{ fontSize: 12, color: "var(--ink3)", lineHeight: 1.5, margin: 0, textAlign: "left" }}>
                    {personalPlanBlockedMsg}
                  </p>
                ) : isAuthenticated ? (
                  <form method="POST" action="/api/payments/vb-initiate">
                    <input type="hidden" name="plan" value={t.plan} />
                    <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
                    <button
                      type="submit"
                      disabled={!agreed}
                      className={t.highlight ? "btn solid" : "btn"}
                      style={{ width: "100%", justifyContent: "center", height: 44 }}
                    >
                      Alege planul {t.label}
                    </button>
                  </form>
                ) : (
                  <Link
                    href="/register"
                    className={t.highlight ? "btn solid" : "btn"}
                    style={{ width: "100%", justifyContent: "center", height: 44 }}
                  >
                    Înregistrează-te
                  </Link>
                )}
                {t.footnote && (
                  <p style={{ fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.5, margin: "10px 0 0", textAlign: "left" }}>
                    {t.footnote}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cod de invitație de la agenție (AG-XXXXXX) — vine de la un owner de pe /app/agency.
          Compact, sub carduri. Vizibil doar la utilizator autentificat fără plan (cazul în care
          se randează acest component); anonimilor le arătăm doar un îndemn de autentificare.
          În modul de schimbare a planului (changeMode) blocul nu se afișează. */}
      {!changeMode && (
      <div className="card" style={{ marginTop: 16, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
        <div className="card-bd" style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
            Ai un cod de invitație de la agenție?
          </div>
          {isAuthenticated ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.5, margin: "0 0 10px" }}>
                Introduceți codul primit de la administratorul agenției (ex. AG-XXXXXX) pentru a
                ocupa un loc și a activa planul HUB.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="AG-XXXXXX"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") activateInvite();
                  }}
                  style={{ flex: "1 1 180px", height: 44, padding: "0 14px", fontSize: 14 }}
                />
                <button
                  type="button"
                  className="btn solid"
                  disabled={invitePending || !inviteCode.trim()}
                  onClick={activateInvite}
                  style={{ height: 44, padding: "0 22px" }}
                >
                  {invitePending ? "Se activează…" : "Activează"}
                </button>
              </div>
              {inviteError && (
                <p style={{ fontSize: 12.5, color: "var(--red, #dc2626)", margin: "8px 0 0" }}>
                  {inviteError}
                </p>
              )}
              {/* Instrucțiuni vizibile implicit (fără clic) — текст по задаче. */}
              <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.6, textAlign: "left" }}>
                <b style={{ display: "block", marginBottom: 4 }}>Cum funcționează:</b>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Proprietarul agenției cumpără abonamentul HUB și alege numărul de locuri.</li>
                  <li>În contul lui, la secțiunea Agenție, generează un cod de invitație (AG-XXXXXX) pentru fiecare agent.</li>
                  <li>
                    Primiți codul de la proprietar, îl introduceți aici și apăsați „Activează”. Contul
                    dumneavoastră primește automat planul HUB.
                  </li>
                </ol>
                <p style={{ margin: "6px 0 0" }}>
                  Fiecare cod este valabil o singură dată și ocupă un loc din agenție.
                </p>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.5, margin: 0 }}>
              <Link href="/login" style={{ color: "var(--blue, #2563eb)" }}>
                Autentifică-te
              </Link>{" "}
              pentru a introduce codul.
            </p>
          )}
        </div>
      </div>
      )}

      {/* «O accesare» — разовая покупка без подписки (Этап C): 1 verificare + 1 dosar + 1 obiect. */}
      <div className="card" style={{ marginTop: 16, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <div
          className="card-bd"
          style={{ padding: "20px 22px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, justifyContent: "space-between" }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              O accesare — 30 MDL <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink3)" }}>· acces unic, fără abonament</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.55, margin: 0 }}>
              Un singur pachet: <b>1 verificare cadastrală</b> + <b>1 examinare dosar</b> + <b>1 obiect</b>.
              Se consumă o singură dată, nu se reînnoiește.
            </p>
          </div>
          <div style={{ flex: "0 0 auto", minWidth: 200 }}>
            {isAuthenticated ? (
              <form method="POST" action="/api/payments/vb-single-access-initiate">
                <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
                <button
                  type="submit"
                  disabled={!agreed}
                  className="btn"
                  style={{ width: "100%", justifyContent: "center", height: 44 }}
                >
                  Cumpără o accesare — 30 MDL
                </button>
              </form>
            ) : (
              <Link
                href="/register"
                className="btn"
                style={{ width: "100%", justifyContent: "center", height: 44 }}
              >
                Înregistrează-te
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <div className="card-bd" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6, marginBottom: 14 }}>
            Preferați să explorați mai întâi? Încercați platforma în modul demo. Sau contactați
            administratorul pentru activarea manuală a planului.
          </p>
          <button className="btn solid" style={{ marginBottom: 12 }} onClick={startDemo}>
            ✨ Încearcă demo-ul gratuit
          </button>
          <div>
            {isAuthenticated ? (
              <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
                Deconectați-vă
              </button>
            ) : (
              <Link className="btn" href="/login" style={{ justifyContent: "center" }}>
                Aveți deja cont? Autentificați-vă
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
