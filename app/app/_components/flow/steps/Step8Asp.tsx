// Финал маршрута. Статус НЕ меняем автоматически — остаётся «В lucru»;
// риелтор переводит в «Finisat» вручную со страницы «Obiectele mele».
export function Step8Asp() {
  return (
    <div className="asp-hero">
      <div className="asp-icon">🏛</div>
      <div className="asp-title">Agenția Servicii Publice (ASP)</div>
      <div className="asp-sub">
        Programare pentru înregistrarea de stat a transferului dreptului de proprietate.
      </div>
      <a href="https://programare.asp.gov.md" className="asp-btn" target="_blank" rel="noopener noreferrer">
        Programați-vă pe ASP.gov.md →
      </a>
      <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.6, maxWidth: "44ch", marginInline: "auto" }}>
        Dosarul tranzacției este complet. Puteți marca tranzacția drept „Finisat" din pagina
        „Obiectele mele”, atunci când considerați necesar.
      </div>
    </div>
  );
}
