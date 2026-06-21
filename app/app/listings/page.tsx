// Anunțuri 999 — заглушка «în curând». Лента/фильтры/карточки убраны до реальной
// интеграции с 999.md. Бэкенд (API /api/listings, lib/listings-service) не трогаем.
export default function ListingsPage() {
  return (
    <div className="ig-page">
      <div className="crumb">Anunțuri 999</div>

      <div className="asp-hero" style={{ maxWidth: 560, margin: "36px auto 0" }}>
        <div className="asp-icon">📰</div>
        <span
          className="badge b-amber"
          style={{ fontSize: 11, padding: "3px 12px", display: "inline-block", marginBottom: 12 }}
        >
          În curând
        </span>
        <div className="asp-title" style={{ fontSize: 24 }}>
          Anunțuri 999
        </div>
        <p className="asp-sub">
          Integrarea cu 999.md este în curs de dezvoltare. În curând veți putea vedea
          anunțurile de la proprietari, le veți filtra după sector și preț și veți salva
          contacte — direct în ImoGhid.
        </p>
      </div>
    </div>
  );
}
