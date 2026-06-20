"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { BrandPanel } from "../_components/BrandPanel";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    prenume: "",
    nume: "",
    email: "",
    phone: "",
    password: "",
    agencyName: "",
    inviteCode: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const name = `${form.prenume} ${form.nume}`.trim();

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        agencyName: form.agencyName || undefined,
        inviteCode: form.inviteCode || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      setError(data?.error || "Nu s-a putut crea contul.");
      return;
    }

    // Автоматический вход после регистрации.
    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    setLoading(false);

    if (!signInRes || signInRes.error) {
      // Аккаунт создан, но автологин не удался — отправляем на страницу входа.
      router.push("/login");
      return;
    }

    // С кодом приглашения PRO уже активен → сразу в приложение.
    // Иначе — выбор плана.
    router.push(data.planActive ? "/app" : "/subscribe");
    router.refresh();
  }

  return (
    <div className="page">
      <BrandPanel
        tag="Înregistrare"
        title="Începeți să lucrați mai eficient"
        desc="Creați contul în 60 de secunde. Accesul este activ imediat după plată."
        features={[
          "BASIC — $10/lună · acces complet la platformă",
          "PRO — $30/lună · + rapoarte PDF, CMA, AI generator",
          "Anulați oricând, fără penalități",
        ]}
      />

      <div className="right">
        <div className="form-box">
          <div className="form-head">
            <div className="form-title">Cont nou</div>
            <div className="form-sub">
              Completați datele de mai jos. Veți alege planul la pasul următor.
            </div>
          </div>

          {error && (
            <div className="error-msg">
              <span>✕</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="prenume">Prenume</label>
                <input
                  id="prenume"
                  type="text"
                  placeholder="Ion"
                  autoComplete="given-name"
                  required
                  value={form.prenume}
                  onChange={update("prenume")}
                />
              </div>
              <div className="field">
                <label htmlFor="nume">Nume</label>
                <input
                  id="nume"
                  type="text"
                  placeholder="Popescu"
                  autoComplete="family-name"
                  required
                  value={form.nume}
                  onChange={update("nume")}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="ion.popescu@exemplu.md"
                autoComplete="email"
                required
                value={form.email}
                onChange={update("email")}
              />
            </div>

            <div className="field">
              <label htmlFor="phone">Telefon</label>
              <input
                id="phone"
                type="tel"
                placeholder="+373 69 000 000"
                autoComplete="tel"
                required
                value={form.phone}
                onChange={update("phone")}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Parolă</label>
              <input
                id="password"
                type="password"
                placeholder="Minimum 8 caractere"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={update("password")}
              />
              <div className="field-hint">
                Cel puțin 8 caractere, o literă mare și un număr.
              </div>
            </div>

            <div className="field">
              <label htmlFor="agency">
                Agenție imobiliară{" "}
                <span className="field-optional">opțional</span>
              </label>
              <input
                id="agency"
                type="text"
                placeholder="RE/MAX, Proimobil, independent..."
                value={form.agencyName}
                onChange={update("agencyName")}
              />
              <div className="field-hint">
                Va apărea pe rapoartele PDF generate pentru clienți.
              </div>
            </div>

            <div className="invite-block">
              <div className="invite-lbl">Cod de invitație</div>
              <div className="invite-desc">
                Dacă ați primit un cod de acces PRO — introduceți-l aici. Planul
                PRO se activează automat.
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <input
                  type="text"
                  placeholder="ex: IMOTEST2025"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    letterSpacing: "0.05em",
                  }}
                  value={form.inviteCode}
                  onChange={update("inviteCode")}
                />
              </div>
            </div>

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Se creează contul…" : "Continuați → alegeți planul"}
            </button>
          </form>

          <div className="link-row" style={{ marginTop: 16 }}>
            Aveți deja cont? <Link href="/login">Intrați</Link>
          </div>

          <div className="disclaimer">
            Prin înregistrare acceptați <a href="#">Termenii de utilizare</a>.
            Datele sunt prelucrate conform <a href="#">Legii 133/2011</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
