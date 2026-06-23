// Accesul la acest pas este garantat de logică doar pentru PRO — fără upsell aici.
export function Step7Report() {
  return (
    <div className="asp-hero" style={{ textAlign: "left", padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Raport complet · PDF</div>
      <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 20, lineHeight: 1.6 }}>
        Conține: verificarea actelor, semnale identificate, acordurile necesare, lista
        documentelor pentru notar, calculele impozitelor și cheltuielilor notariale.
      </div>
      <button className="asp-btn" onClick={() => alert("Raport PDF — în curând.")}>
        ⤓ Descărcați raportul (PDF)
      </button>
    </div>
  );
}
