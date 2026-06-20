export function Step7Report({ plan }: { plan?: string }) {
  const isPro = plan === "PRO";

  if (!isPro) {
    return (
      <div className="card">
        <div className="card-hd">
          <b>Raport complet · PDF</b>
          <span className="badge b-purple" style={{ marginLeft: "auto" }}>PRO</span>
        </div>
        <div className="card-bd">
          <div className="notice amber" style={{ marginBottom: 12 }}>
            <div className="notice-dot" />
            <div>
              <b>Funcție disponibilă în planul PRO</b>
              <p>
                Raportul PDF profesional cu branding pentru client este inclus în planul PRO
                ($30/lună). Planul dvs. actual este BASIC.
              </p>
            </div>
          </div>
          <a className="btn solid" href="/subscribe">
            Treceți la PRO — $30/lună ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="asp-hero" style={{ textAlign: "left", padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Raport complet · PDF</div>
      <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 20, lineHeight: 1.6 }}>
        Conține: verificarea actelor, semnale identificate, acordurile necesare, lista
        documentelor pentru notar, calculele impozitelor și cheltuielilor notariale.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="asp-btn" onClick={() => alert("Raport PDF — în curând (funcție PRO).")}>
          ⤓ Descărcați raportul (PDF)
        </button>
        <button className="btn" onClick={() => alert("Trimiteți clientului — în curând.")}>
          Trimiteți clientului ↗
        </button>
      </div>
    </div>
  );
}
