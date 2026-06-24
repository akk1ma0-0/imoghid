"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

type Initial = {
  name: string;
  email: string;
  agentie: string;
  telefon: string;
  plan: "BASIC" | "PRO";
  notifLegislatie: boolean;
  usageUsed: number;
  usageLimit: number;
};

// Заглушка даты продления (реальной оплаты Stripe пока нет).
const RENEWAL_DATE = "01.07.2026";

function Notice({ kind, text }: { kind: "red" | "green"; text: string }) {
  return (
    <div className={`notice ${kind}`} style={{ marginTop: 10 }}>
      <div className="notice-dot" />
      <div>
        <b>{text}</b>
      </div>
    </div>
  );
}

export function ProfilePanel({ initial }: { initial: Initial }) {
  // ── Profil ──
  const [name, setName] = useState(initial.name);
  const [agentie, setAgentie] = useState(initial.agentie);
  const [telefon, setTelefon] = useState(initial.telefon);
  const [pBusy, setPBusy] = useState(false);
  const [pMsg, setPMsg] = useState<{ k: "red" | "green"; t: string } | null>(null);

  async function saveProfile() {
    setPMsg(null);
    setPBusy(true);
    try {
      const r = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, agentie, telefon }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Eroare.");
      setPMsg({ k: "green", t: "Profil actualizat." });
    } catch (e) {
      setPMsg({ k: "red", t: e instanceof Error ? e.message : "Eroare." });
    } finally {
      setPBusy(false);
    }
  }

  // ── Parolă ──
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ k: "red" | "green"; t: string } | null>(null);

  async function savePassword() {
    setPwMsg(null);
    if (nw !== cf) {
      setPwMsg({ k: "red", t: "Parolele noi nu coincid." });
      return;
    }
    if (nw.length < 8) {
      setPwMsg({ k: "red", t: "Parola nouă trebuie să aibă minimum 8 caractere." });
      return;
    }
    setPwBusy(true);
    try {
      const r = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw, confirmPassword: cf }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Eroare.");
      setPwMsg({ k: "green", t: "Parola a fost schimbată." });
      setCur("");
      setNw("");
      setCf("");
    } catch (e) {
      setPwMsg({ k: "red", t: e instanceof Error ? e.message : "Eroare." });
    } finally {
      setPwBusy(false);
    }
  }

  // Уведомления о законодательстве всегда включены — переключатель убран из UI
  // (поле User.notifLegislatie в БД сохранено).

  // ── Ștergere cont ──
  const [delBusy, setDelBusy] = useState(false);
  async function deleteAccount() {
    if (
      !window.confirm(
        "Ștergeți definitiv contul și toate datele asociate? Această acțiune este ireversibilă.",
      )
    )
      return;
    setDelBusy(true);
    try {
      const r = await fetch("/api/user", { method: "DELETE" });
      if (!r.ok) throw new Error();
      await signOut({ callbackUrl: "/login" });
    } catch {
      setDelBusy(false);
      window.alert("Eroare la ștergerea contului. Încercați din nou.");
    }
  }

  const pct = initial.usageLimit > 0 ? Math.min(100, Math.round((initial.usageUsed / initial.usageLimit) * 100)) : 0;

  return (
    <div className="ig-page" style={{ maxWidth: 720 }}>
      <div className="crumb">Cont</div>
      <h1>Profilul meu</h1>
      <p className="sub">Gestionați datele contului, parola și abonamentul.</p>

      <button
        className="btn"
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{ marginBottom: 16 }}
      >
        ↪ Ieșire din cont
      </button>

      {/* ── PROFIL ── */}
      <div className="card">
        <div className="card-hd"><b>Profil</b></div>
        <div className="card-bd">
          <div className="field-group">
            <label>Nume și prenume</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nume Prenume" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Agenție / Companie <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span></label>
              <input value={agentie} onChange={(e) => setAgentie(e.target.value)} placeholder="ex: ImoPro SRL" />
            </div>
            <div className="field-group">
              <label>Telefon <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span></label>
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+373 69 000 000" />
            </div>
          </div>
          <div className="field-group">
            <label>Email</label>
            <input value={initial.email} disabled style={{ opacity: 0.7 }} />
          </div>
          <button className="btn solid" onClick={saveProfile} disabled={pBusy}>
            {pBusy ? "Se salvează…" : "Salvați modificările"}
          </button>
          {pMsg && <Notice kind={pMsg.k} text={pMsg.t} />}
        </div>
      </div>

      {/* ── PAROLĂ ── */}
      <div className="card">
        <div className="card-hd"><b>Parolă</b></div>
        <div className="card-bd">
          <div className="field-group">
            <label>Parola curentă</label>
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Parola nouă</label>
              <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field-group">
              <label>Confirmați parola</label>
              <input type="password" value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <button className="btn solid" onClick={savePassword} disabled={pwBusy || !cur || !nw || !cf}>
            {pwBusy ? "Se salvează…" : "Schimbați parola"}
          </button>
          {pwMsg && <Notice kind={pwMsg.k} text={pwMsg.t} />}
        </div>
      </div>

      {/* ── ABONAMENT ── */}
      <div className="card">
        <div className="card-hd"><b>Abonament</b></div>
        <div className="card-bd">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span className={`badge ${initial.plan === "PRO" ? "b-blue" : "b-gray"}`} style={{ fontSize: 12, padding: "3px 12px" }}>
              {initial.plan}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>
              Următoarea reînnoire: {RENEWAL_DATE}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink2)", margin: "10px 0 5px" }}>
            Analize documente (Pasul 3) luna curentă:{" "}
            <b>{initial.usageUsed} / {initial.usageLimit}</b>
          </div>
          <div className="prog"><div className="prog-fill" style={{ width: `${pct}%` }} /></div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => window.alert("Schimbarea planului — în curând.")}>
            Schimbați planul
          </button>
        </div>
      </div>


      {/* ── ZONĂ PERICULOASĂ ── */}
      <div className="card" style={{ borderColor: "var(--red-br)" }}>
        <div className="card-hd" style={{ background: "var(--red-bg)" }}>
          <b style={{ color: "var(--red)" }}>Zonă periculoasă</b>
        </div>
        <div className="card-bd">
          <p className="sub" style={{ marginBottom: 12 }}>
            Ștergerea contului elimină definitiv toate datele dvs. (tranzacții, documente, contacte).
            Acțiunea este ireversibilă.
          </p>
          <button className="btn" style={{ borderColor: "var(--red-br)", color: "var(--red)" }} onClick={deleteAccount} disabled={delBusy}>
            {delBusy ? "Se șterge…" : "Ștergeți contul"}
          </button>
        </div>
      </div>
    </div>
  );
}
