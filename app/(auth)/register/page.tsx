"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { BrandPanel } from "../_components/BrandPanel";
import { TrackVisit } from "@/components/TrackVisit";
import { PaymentCards } from "@/components/PaymentCards";
import { PasswordInput } from "@/components/PasswordInput";

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
  // Consimțământ DPA (Legea 195/2024) — obligatoriu pentru înregistrare.
  const [dpaConsent, setDpaConsent] = useState(false);
  const [showDpa, setShowDpa] = useState(false);

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

    if (!dpaConsent) {
      setError(
        "Trebuie să acceptați Declarația și consimțământul privind prelucrarea datelor cu caracter personal.",
      );
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email,
        phone: form.phone,
        password: form.password,
        dpaConsent,
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

    // Шаг 1 — подтверждение e-mail; далее (после подтверждения) — назначение плана.
    router.push("/app/verify-email-pending");
    router.refresh();
  }

  return (
    <div className="page">
      <TrackVisit path="register" />
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
              <PasswordInput
                id="password"
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
              <PasswordInput
                id="confirmPassword"
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

            {/* Declarație și consimțământ DPA (Legea 195/2024) — obligatoriu. Textul integral
                e vizibil pe pagină (la clic „Arată textul integral"), nu ascuns pe altă pagină. */}
            <div
              style={{
                border: "1px solid var(--line, #e5e7eb)",
                borderRadius: 10,
                padding: 14,
                margin: "4px 0 16px",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink, #111827)", marginBottom: 6 }}>
                Declarație și consimțământ privind prelucrarea datelor cu caracter personal
              </div>
              <button
                type="button"
                onClick={() => setShowDpa((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--blue, #1d4ed8)",
                  fontSize: 12.5,
                }}
              >
                {showDpa ? "Ascunde textul ▲" : "Arată textul integral ▼"}
              </button>

              {showDpa && (
                <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink2, #374151)" }}>
                  <p style={{ margin: "0 0 6px" }}>
                    Prin crearea contului și utilizarea platformei ImoGhid, confirm că:
                  </p>
                  <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
                    <li>
                      am luat cunoștință că datele cu caracter personal sunt prelucrate în conformitate
                      cu Legea nr. 195/2024 privind protecția datelor cu caracter personal;
                    </li>
                    <li>
                      datele proprii pe care le introduc sunt corecte și consimt la prelucrarea lor în
                      scopul furnizării serviciilor platformei;
                    </li>
                    <li>
                      atunci când introduc date cu caracter personal ale altor persoane (clienți, părți
                      la tranzacție etc.), dețin temeiul legal pentru a le furniza și prelucra, și îmi
                      asum răspunderea pentru aceasta;
                    </li>
                    <li>
                      voi utiliza datele exclusiv în scopul pregătirii și derulării tranzacțiilor
                      imobiliare, respectând drepturile persoanelor vizate;
                    </li>
                    <li>
                      am luat cunoștință de{" "}
                      <a href="/confidentialitate" target="_blank" rel="noopener noreferrer">
                        Politica de confidențialitate
                      </a>
                      .
                    </li>
                  </ul>
                  <div
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fcd34d",
                      color: "#92400e",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ Atenție: introducerea datelor altor persoane fără temei legal sau consimțământ
                    este interzisă și atrage răspunderea utilizatorului.
                  </div>
                </div>
              )}

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--ink2, #374151)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={dpaConsent}
                  onChange={(e) => setDpaConsent(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span>Am citit și accept.</span>
              </label>
            </div>

            <button className="btn-primary" type="submit" disabled={loading || !dpaConsent}>
              {loading ? "Se creează contul…" : "Creați cont"}
            </button>
          </form>

          <div className="link-row" style={{ marginTop: 16 }}>
            Aveți deja cont? <Link href="/login">Intrați</Link>
          </div>

          <div className="link-row" style={{ marginTop: 6 }}>
            <Link href="/app/pending">Vezi planurile și prețurile →</Link>
          </div>

          <div className="disclaimer">
            Prin înregistrare acceptați{" "}
            <a href="/termeni" target="_blank" rel="noopener noreferrer">Termenii de utilizare</a>{" "}
            și{" "}
            <a href="/confidentialitate" target="_blank" rel="noopener noreferrer">Politica de confidențialitate</a>.
          </div>

          <PaymentCards />
        </div>
      </div>
    </div>
  );
}
