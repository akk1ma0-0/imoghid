"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { BrandPanel } from "../_components/BrandPanel";

export default function LoginPage() {
  // useSearchParams требует Suspense-границы при статической генерации.
  return (
    <Suspense fallback={<div className="page" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!res || res.error) {
      setError(
        "Email sau parolă incorectă. Verificați datele și încercați din nou.",
      );
      return;
    }

    // Если подписка не активна, middleware на /app сам перенаправит на /subscribe.
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="page">
      <BrandPanel
        tag="Moldova · 2026"
        title="Ghidul tău în fiecare tranzacție imobiliară"
        desc="De la verificarea documentelor până la programarea la ASP — platforma verifică, semnalează și calculează."
        features={[
          "Verificare automată a actelor",
          "Anunțuri noi de la proprietari — 999.md în timp real",
          "Calculator impozit · notariat · credit ipotecar",
          "Raport PDF profesional pentru client",
        ]}
      />

      <div className="right">
        <div className="form-box">
          <div className="form-head">
            <div className="form-title">Bună ziua</div>
            <div className="form-sub">
              Introduceți datele de acces pentru a continua.
            </div>
          </div>

          {error && (
            <div className="error-msg">
              <span>✕</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="agent@exemplu.md"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Parolă</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div style={{ textAlign: "right", marginBottom: 16 }}>
              <a
                href="#"
                style={{
                  fontSize: 12,
                  color: "var(--ink3)",
                  textDecoration: "none",
                }}
              >
                Am uitat parola
              </a>
            </div>

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Se verifică…" : "Intră în cont"}
            </button>
          </form>

          <div className="divider">
            <span>sau</span>
          </div>

          <div className="link-row">
            Nu aveți cont? <Link href="/register">Înregistrați-vă</Link>
          </div>

          <div className="disclaimer">
            Prin accesarea platformei confirmați că ați citit{" "}
            <a href="#">Termenii de utilizare</a> și{" "}
            <a href="#">Politica de confidențialitate</a>. Responsabilitatea
            finală pentru tranzacție revine notarului și agentului.
          </div>
        </div>
      </div>
    </div>
  );
}
