"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { BrandPanel } from "../_components/BrandPanel";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Молдавский формат: +373 XX XXX XXX (8 цифр после +373) или 0XX XXX XXX (9 цифр с 0).
const PHONE_RE = /^(\+373\d{8}|0\d{8})$/;

type FieldErrors = Partial<
  Record<"email" | "phone" | "password" | "confirmPassword", string>
>;

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    prenume: "",
    nume: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    agencyName: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!EMAIL_RE.test(form.email.trim())) {
      errs.email = "Introduceți o adresă de email validă.";
    }
    const phoneClean = form.phone.replace(/[\s\-()]/g, "");
    if (!PHONE_RE.test(phoneClean)) {
      errs.phone = "Telefon invalid. Format: +373 XX XXX XXX sau 0XX XXX XXX.";
    }
    if (form.password.length < 8) {
      errs.password = "Parola trebuie să aibă minimum 8 caractere.";
    }
    if (form.confirmPassword !== form.password) {
      errs.confirmPassword = "Parolele nu coincid.";
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

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
      router.push("/login");
      return;
    }

    // Без кода приглашения подписка неактивна → выбор плана.
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
          "PRO — $30/lună · + rapoarte PDF, CMA, generator anunțuri",
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

          <form onSubmit={handleSubmit} noValidate>
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
                  placeholder="Numele"
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
                className={fieldErrors.email ? "error" : undefined}
                value={form.email}
                onChange={update("email")}
              />
              {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
            </div>

            <div className="field">
              <label htmlFor="phone">Telefon</label>
              <input
                id="phone"
                type="tel"
                placeholder="+373 69 000 000"
                autoComplete="tel"
                required
                className={fieldErrors.phone ? "error" : undefined}
                value={form.phone}
                onChange={update("phone")}
              />
              {fieldErrors.phone && <div className="field-error">{fieldErrors.phone}</div>}
            </div>

            <div className="field">
              <label htmlFor="password">Parolă</label>
              <input
                id="password"
                type="password"
                placeholder="Minimum 8 caractere"
                autoComplete="new-password"
                required
                className={fieldErrors.password ? "error" : undefined}
                value={form.password}
                onChange={update("password")}
              />
              {fieldErrors.password ? (
                <div className="field-error">{fieldErrors.password}</div>
              ) : (
                <div className="field-hint">Minimum 8 caractere.</div>
              )}
            </div>

            <div className="field">
              <label htmlFor="confirmPassword">Confirmați parola</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repetați parola"
                autoComplete="new-password"
                required
                className={fieldErrors.confirmPassword ? "error" : undefined}
                value={form.confirmPassword}
                onChange={update("confirmPassword")}
              />
              {fieldErrors.confirmPassword && (
                <div className="field-error">{fieldErrors.confirmPassword}</div>
              )}
            </div>

            <div className="field">
              <label htmlFor="agency">
                Agenție imobiliară <span className="field-optional">opțional</span>
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

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Se creează contul…" : "Continuați → alegeți planul"}
            </button>
          </form>

          <div className="trial-banner">
            <span aria-hidden>🎁</span>
            <span>
              <b>Primele 7 zile — gratuit.</b>
            </span>
          </div>

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
