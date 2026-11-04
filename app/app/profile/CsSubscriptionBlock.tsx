"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { fmtDateChisinau } from "@/lib/date-chisinau";
import { cardChangeDeniedText } from "@/lib/subscription-rules";

// Блок управления подпиской с автопродлением (CyberSource) в профиле. Для пользователей без такой
// подписки (в т.ч. VictoriaBank) ничего не показывает — их интерфейс не меняется.
type View = {
  plan: string;
  amount: string | null;
  currency: string | null;
  status: "ACTIVE" | "PAST_DUE" | "CANCELED";
  cancelAtPeriodEnd: boolean;
  paidUntil: string;
  nextChargeAt: string | null;
  accessUntil: string;
  card: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  canCancel: boolean;
  canResume: boolean;
  canChangeCard: boolean;
  canPayNow: boolean;
  upgradeTo: { plan: string; amount: string } | null;
  downgradeTo: { plan: string; amount: string } | null;
  pendingChange: { plan: string; amount: string | null; from: string } | null;
  canCancelPendingChange: boolean;
};

const PLAN_LABEL: Record<string, string> = { BASIC: "Basic", PRO: "Pro" };

function cardLabel(c: View["card"]): string | null {
  if (!c) return null;
  const exp = c.expMonth && c.expYear ? `, valabil până la ${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}` : "";
  return `${c.brand ?? "Card"} •••• ${c.last4 ?? "····"}${exp}`;
}

export function CsSubscriptionBlock() {
  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // Какое действие ждёт подтверждения: отмена подписки или смена плана.
  const [confirm, setConfirm] = useState<null | "cancel" | "upgrade" | "downgrade">(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  async function load() {
    const r = await fetch("/api/subscription", { cache: "no-store" }).catch(() => null);
    const data = (await r?.json().catch(() => null)) as { subscription?: View | null } | null;
    setView(data?.subscription ?? null);
    setLoaded(true);
  }
  useEffect(() => {
    load();
    const card = new URLSearchParams(window.location.search).get("card");
    if (card === "updated") setMessage({ tone: "ok", text: "Cardul a fost actualizat." });
    else {
      // Страница смены карты не пустила — объясняем причину, а не молчим.
      const denied = cardChangeDeniedText(card);
      if (denied) setMessage({ tone: "warn", text: denied });
    }
  }, []);

  async function act(path: string, method: "POST" | "DELETE" = "POST", okText?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(path, { method });
      const data = (await r.json().catch(() => null)) as { error?: string; message?: string; subscription?: View | null; status?: string } | null;
      if (data?.subscription !== undefined) setView(data.subscription);
      else await load();
      if (!r.ok && r.status !== 202) setMessage({ tone: "warn", text: data?.error ?? data?.message ?? "Acțiunea nu a reușit. Încercați din nou." });
      else if (data?.message) setMessage({ tone: r.ok ? "ok" : "warn", text: data.message });
      else if (r.ok && okText) setMessage({ tone: "ok", text: okText });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (!loaded) return null;
  if (!view) {
    // Подписки с автопродлением нет, но причина отказа странице смены карты должна быть видна.
    return message ? (
      <div className="notice amber" style={{ marginTop: 16 }}>
        <div className="notice-dot" />
        <div>{message.text}</div>
      </div>
    ) : null;
  }
  const card = cardLabel(view.card);

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line, #e5e7eb)" }}>
      {view.status === "PAST_DUE" && (
        <div className="notice amber" style={{ marginBottom: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>Plata lunară nu a fost procesată. Actualizați cardul.</b>
            <p style={{ margin: "4px 0 0", fontSize: 12.5 }}>Accesul rămâne activ până la {fmtDateChisinau(view.accessUntil)}.</p>
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink2)" }}>
        <div>
          Plan: <b style={{ color: "var(--ink)" }}>{PLAN_LABEL[view.plan] ?? view.plan}</b>
          {view.amount && <> · {view.amount} {view.currency} / lună</>}
        </div>
        {view.status === "CANCELED" ? (
          <div>Abonament anulat. Accesul rămâne activ până la <b>{fmtDateChisinau(view.paidUntil)}</b>.</div>
        ) : view.nextChargeAt ? (
          <div>Următoarea plată: <b>{fmtDateChisinau(view.nextChargeAt)}</b></div>
        ) : null}
        <div>Plătit până la: {fmtDateChisinau(view.paidUntil)}</div>
        {card && <div>Card: {card}</div>}
        {view.pendingChange && (
          <div>
            După {fmtDateChisinau(view.pendingChange.from)}:{" "}
            <b style={{ color: "var(--ink)" }}>{PLAN_LABEL[view.pendingChange.plan] ?? view.pendingChange.plan}</b>
            {view.pendingChange.amount && <>, {view.pendingChange.amount} {view.currency} / lună</>}
          </div>
        )}
      </div>

      {message && (
        <div className={`notice ${message.tone === "ok" ? "blue" : "amber"}`} style={{ marginTop: 10 }}>
          <div className="notice-dot" />
          <div>{message.text}</div>
        </div>
      )}

      {confirm === "upgrade" && view.upgradeTo ? (
        <div className="notice amber" style={{ marginTop: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>Treceți la {PLAN_LABEL[view.upgradeTo.plan] ?? view.upgradeTo.plan}?</b>
            <p style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
              Se va efectua acum o plată de {view.upgradeTo.amount} {view.currency}, iar perioada nouă începe astăzi. Suma plătită
              pentru {PLAN_LABEL[view.plan] ?? view.plan} nu se returnează.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn solid"
                disabled={busy}
                onClick={() => window.location.assign(`/app/checkout?purpose=SUBSCRIPTION&plan=${view.upgradeTo!.plan}`)}
              >
                Continuă spre plată
              </button>
              <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>Renunță</button>
            </div>
          </div>
        </div>
      ) : confirm === "downgrade" && view.downgradeTo ? (
        <div className="notice amber" style={{ marginTop: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>Treceți la {PLAN_LABEL[view.downgradeTo.plan] ?? view.downgradeTo.plan}?</b>
            <p style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
              Planul {PLAN_LABEL[view.plan] ?? view.plan} rămâne activ până la {fmtDateChisinau(view.paidUntil)}, apoi se trece la{" "}
              {PLAN_LABEL[view.downgradeTo.plan] ?? view.downgradeTo.plan} — {view.downgradeTo.amount} {view.currency} / lună.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn solid"
                disabled={busy}
                onClick={() => act("/api/subscription/downgrade", "POST", "Schimbarea planului a fost programată.")}
              >
                Da, trec la {PLAN_LABEL[view.downgradeTo.plan] ?? view.downgradeTo.plan}
              </button>
              <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>Renunță</button>
            </div>
          </div>
        </div>
      ) : confirm === "cancel" ? (
        <div className="notice amber" style={{ marginTop: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>Anulați abonamentul?</b>
            <p style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
              Accesul rămâne activ până la {fmtDateChisinau(view.paidUntil)}. Nu se efectuează returnarea sumei.
              {view.pendingChange && " Schimbarea de plan programată nu va mai avea loc."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn solid" disabled={busy} onClick={() => act("/api/subscription/cancel")}>Da, anulează</button>
              <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>Renunță</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {view.canPayNow && (
            <button className="btn solid" disabled={busy} onClick={() => act("/api/subscription/pay-now")}>
              Plătește acum
            </button>
          )}
          {view.canChangeCard && (
            <Link className="btn" href="/app/subscription/card">Schimbă cardul</Link>
          )}
          {view.canResume && (
            <button className="btn solid" disabled={busy} onClick={() => act("/api/subscription/resume")}>Reia abonamentul</button>
          )}
          {view.upgradeTo && (
            <button className="btn solid" disabled={busy} onClick={() => setConfirm("upgrade")}>
              Treceți la {PLAN_LABEL[view.upgradeTo.plan] ?? view.upgradeTo.plan}
            </button>
          )}
          {view.downgradeTo && (
            <button className="btn" disabled={busy} onClick={() => setConfirm("downgrade")}>
              Treceți la {PLAN_LABEL[view.downgradeTo.plan] ?? view.downgradeTo.plan}
            </button>
          )}
          {view.pendingChange && view.canCancelPendingChange && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => act("/api/subscription/downgrade", "DELETE", `Schimbarea a fost anulată. Rămâneți pe planul ${PLAN_LABEL[view.plan] ?? view.plan}.`)}
            >
              Anulează schimbarea
            </button>
          )}
          {view.canCancel && (
            <button className="btn" disabled={busy} onClick={() => setConfirm("cancel")}>Anulează abonamentul</button>
          )}
        </div>
      )}
    </div>
  );
}
