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
  Record<"name" | "email" | "phone" | "password" | "confirmPassword", string>
>;

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
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
    if (!form.name.trim()) {
      errs.name = "Introduceți numele și prenumele.";
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      errs.email = "Introduceți o adresă de email validă.";
    }
    // Telefon — opțional; validăm doar dacă e completat.
    const phoneClean = form.phone.replace(/[\s\-()]/g, "");
    if (phoneClean && !PHONE_RE.test(phoneClean)) {
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

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email,
        phone: form.phone,
        password: form.password,
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

    // Без плана (plan = null) → страница ожидания активации.
    router.push("/app/pending");
    router.refresh();
  }

  return (
    <div className="page">
      <BrandPanel
        tag="Înregistrare"
        title="Începeți să lucrați mai eficient"
        desc="Creați contul în câteva secunde. Planul este activat de administrator."
        features={[
          "Verificare automată a actelor",
          "Anunțuri noi de la proprietari — 999.md",
          "Fișa obiectului — raport pentru client",
        ]}
      />

      <div className="right">
        <div className="form-box">
          <div className="form-head">
            <div className="form-title">Cont nou</div>
            <div className="form-sub">Completați datele de mai jos pentru a crea contul.</div>
          </div>

          {error && (
            <div className="error-msg">
              <span>✕</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="name">Nume și prenume</label>
              <input
                id="name"
                type="text"
                placeholder="Nume Prenume"
                autoComplete="name"
                required
                className={fieldErrors.name ? "error" : undefined}
                value={form.name}
                onChange={update("name")}
              />
              {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="email@exemplu.md"
                autoComplete="email"
                required
                className={fieldErrors.email ? "error" : undefined}
                value={form.email}
                onChange={update("email")}
              />
              {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
            </div>

            <div className="field">
              <label htmlFor="phone">
                Telefon <span className="field-optional">opțional</span>
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="+373 ..."
                autoComplete="tel"
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

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Se creează contul…" : "Creați cont"}
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
            Prin înregistrare acceptați <a href="#">Termenii de utilizare</a>. Datele sunt
            prelucrate conform <a href="#">Legii 133/2011</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
