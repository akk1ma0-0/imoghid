// Левая брендовая панель для /login и /register.
// Простая разметка без клиентской логики — переиспользуется обеими страницами.

type Feature = string;

export function BrandPanel({
  tag,
  title,
  desc,
  features,
}: {
  tag: string;
  title: string;
  desc: string;
  features: Feature[];
}) {
  return (
    <div className="left">
      <div className="logo">
        <div className="logo-icon">IG</div>
        <div>
          <div className="logo-name">ImoGhid</div>
          <span className="logo-sub">Platforma agentului imobiliar</span>
        </div>
      </div>

      <div className="brand-content">
        <div className="brand-tag">{tag}</div>
        <div className="brand-title">{title}</div>
        <div className="brand-desc">{desc}</div>

        <div className="feat-list">
          {features.map((f) => (
            <div className="feat" key={f}>
              <div className="feat-dot" />
              <div className="feat-txt">{f}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="left-footer">© 2025 ImoGhid · Legea 133/2011</div>
    </div>
  );
}
