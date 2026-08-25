"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
};
type Agency = {
  seatsPaid: number;
  pricePerSeatMdl: number;
  negotiated: boolean;
  planExpiresAt: string | null;
  members: Member[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function AgencyClient({
  agency,
  feePerSeat,
  minSeats,
  currentUserId,
}: {
  agency: Agency | null;
  feePerSeat: number;
  minSeats: number;
  currentUserId: string;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [buySeats, setBuySeats] = useState(agency ? 1 : minSeats);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Нет агентства: форма покупки мест (минимум minSeats) ──
  if (!agency) {
    return (
      <div className="ig-page" style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginTop: 32, marginBottom: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>HUB / Agenție</h1>
          <p style={{ fontSize: 14, color: "var(--ink3)", lineHeight: 1.6 }}>
            {feePerSeat} MDL / loc, minim {minSeats} locuri. Cumpărați locuri și invitați agenții
            din echipa dvs.
          </p>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-bd" style={{ padding: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Număr de locuri
            </label>
            <input
              type="number"
              min={minSeats}
              value={buySeats}
              onChange={(e) => setBuySeats(Math.max(minSeats, Number(e.target.value) || minSeats))}
              style={{ width: 120, height: 40, padding: "0 12px", fontSize: 15 }}
            />
            <div style={{ fontSize: 13, color: "var(--ink2)", margin: "10px 0 16px" }}>
              Total: <b>{buySeats * feePerSeat} MDL</b> / lună
            </div>
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Sunt de acord cu{" "}
                <a href="/termeni" target="_blank" rel="noopener noreferrer">Termenii de plată și Politica de returnare</a>.
              </span>
            </label>
            <form method="POST" action="/api/payments/vb-agency-initiate">
              <input type="hidden" name="seats" value={buySeats} />
              <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />
              <button type="submit" disabled={!agreed} className="btn solid" style={{ height: 44 }}>
                Cumpără {buySeats} locuri — {buySeats * feePerSeat} MDL
              </button>
            </form>
            <p style={{ fontSize: 12, color: "var(--ink3)", marginTop: 12, lineHeight: 1.5 }}>
              Pentru agenții imobiliare cu mai mulți utilizatori, tariful poate fi negociat —
              contactați-ne.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Есть агентство: управление ──
  const occupied = agency.members.length;
  const free = Math.max(0, agency.seatsPaid - occupied);

  async function generateCode() {
    setBusy(true);
    setError(null);
    setCode(null);
    try {
      const r = await fetch("/api/agency/invite", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error);
      setCode(d.code);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Eliminați acest membru? Accesul HUB va fi retras imediat.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/agency/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ig-page" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginTop: 28, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Agenția mea</h1>
      </div>

      {/* Сводка мест */}
      <div className="card" style={{ borderColor: "var(--blue, #2563eb)" }}>
        <div className="card-bd" style={{ padding: "18px 22px", display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>
              {occupied} <span style={{ fontSize: 15, color: "var(--ink3)", fontWeight: 500 }}>din {agency.seatsPaid} locuri</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>{free} locuri libere</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink3)", textAlign: "right" }}>
            Se reînnoiește: {fmtDate(agency.planExpiresAt)}
            {agency.negotiated && (
              <div style={{ color: "var(--blue, #2563eb)", fontWeight: 600 }}>tarif negociat ({agency.pricePerSeatMdl} MDL/loc)</div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="notice red" style={{ marginTop: 12 }}>
          <div className="notice-dot" /><div><b>{error}</b></div>
        </div>
      )}

      {/* Действия */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn solid" disabled={busy || free <= 0} onClick={generateCode}>
          Generează cod de invitație
        </button>
        <form method="POST" action="/api/payments/vb-agency-initiate" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="hidden" name="agreedToTerms" value="true" />
          <input type="number" name="seats" min={1} defaultValue={1} style={{ width: 72, height: 38, padding: "0 10px" }} title="Locuri suplimentare" />
          <button type="submit" className="btn">Cumpără locuri suplimentare</button>
        </form>
      </div>
      {free <= 0 && (
        <p style={{ fontSize: 12, color: "var(--ink3)", marginTop: 6 }}>
          Toate locurile sunt ocupate — cumpărați locuri suplimentare pentru a invita mai mulți agenți.
        </p>
      )}

      {code && (
        <div className="card" style={{ marginTop: 12, borderColor: "var(--blue, #2563eb)" }}>
          <div className="card-bd" style={{ padding: "16px 22px" }}>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 6 }}>
              Cod de invitație generat — transmiteți-l agentului. Se folosește o singură dată.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.05em" }}>{code}</code>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(code)}>Copiază</button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 8 }}>
              Agentul îl introduce la „Activați abonamentul” (cont nou sau existent).
            </div>
          </div>
        </div>
      )}

      {/* Участники */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-hd"><b>Membrii agenției</b></div>
        <div className="card-bd" style={{ padding: 0 }}>
          {agency.members.length === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: "var(--ink3)" }}>
              Niciun membru încă. Generați un cod de invitație și transmiteți-l agenților.
            </div>
          ) : (
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "var(--ink3)" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "var(--ink3)" }}>Rol</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "var(--ink3)" }}>Din</th>
                  <th style={{ padding: "10px 16px" }} />
                </tr>
              </thead>
              <tbody>
                {agency.members.map((m) => (
                  <tr key={m.userId} style={{ borderTop: "1px solid var(--line, #eef0f2)" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{m.email}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12.5 }}>
                      <span className={`badge ${m.role === "OWNER" ? "b-blue" : "b-gray"}`}>{m.role}</span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12.5, color: "var(--ink3)" }}>{fmtDate(m.joinedAt)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => removeMember(m.userId)}
                        title={m.userId === currentUserId ? "Eliminați-vă locul propriu" : "Eliminați membrul"}
                      >
                        Elimină
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
