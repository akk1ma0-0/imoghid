"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Listing = {
  id: string;
  externalId: string;
  url: string;
  listingType: "APARTAMENT" | "CASA" | "TEREN" | "COMERCIAL";
  sector: string | null;
  address: string | null;
  priceEur: number | null;
  rooms: number | null;
  areaM2: number | null;
  floor: number | null;
  totalFloors: number | null;
  description: string | null;
  isOwner: boolean;
  priceChange: "UP" | "DOWN" | "STABLE";
  priceDiffEur: number | null;
  freshLabel: string;
  blacklist: { tag: string; reportCount: number; note: string } | null;
  savedContact: { phone: string | null; note: string | null } | null;
};

type Filters = {
  type: string | null;
  sector: string | null;
  priceDropped: boolean;
  ownerOnly: boolean;
  priceMin: string;
  priceMax: string;
  rooms: string;
};

const TYPE_LABEL: Record<string, string> = {
  APARTAMENT: "Apartament",
  CASA: "Casă",
  TEREN: "Teren",
  COMERCIAL: "Comercial",
};
const SECTORS = ["Botanica", "Centru", "Râșcani", "Ciocana", "Buiucani"];

function fmtEur(n: number | null): string {
  return n === null ? "—" : `${n.toLocaleString("ro-MD")} €`;
}

function ListingCard({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [saved, setSaved] = useState(!!listing.savedContact);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(listing.savedContact?.phone ?? "");
  const [note, setNote] = useState(listing.savedContact?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch(`/api/listings/${listing.id}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, note }),
    });
    setBusy(false);
    setSaved(true);
    setEditing(false);
  }
  async function remove() {
    setBusy(true);
    await fetch(`/api/listings/${listing.id}/contact`, { method: "DELETE" });
    setBusy(false);
    setSaved(false);
    setEditing(false);
    setPhone("");
    setNote("");
  }
  function cancel() {
    setEditing(false);
    setPhone(listing.savedContact?.phone ?? (saved ? phone : ""));
    setNote(listing.savedContact?.note ?? (saved ? note : ""));
  }

  function toDeal() {
    const addr = listing.sector
      ? `sec. ${listing.sector}, ${listing.address ?? ""}`.trim()
      : listing.address ?? "";
    const qs = new URLSearchParams({
      address: addr,
      objectType: TYPE_LABEL[listing.listingType],
    });
    router.push(`/app/transactions/new?${qs.toString()}`);
  }

  const oldPrice =
    listing.priceChange === "DOWN" && listing.priceDiffEur && listing.priceEur
      ? listing.priceEur + listing.priceDiffEur
      : null;
  const meta = [
    listing.areaM2 ? `${listing.areaM2} m²` : null,
    listing.floor && listing.totalFloors ? `et. ${listing.floor}/${listing.totalFloors}` : null,
    listing.description,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="lcard">
      <div className="lthumb">
        <span className="new-badge">{listing.freshLabel}</span>
        {listing.blacklist && <span className="warn-badge">⚠ Listă neagră</span>}
        {listing.priceChange === "DOWN" && listing.priceDiffEur && (
          <span className="price-drop">↓ −{listing.priceDiffEur.toLocaleString("ro-MD")} €</span>
        )}
        {listing.priceChange === "UP" && listing.priceDiffEur && (
          <span className="price-up">↑ +{listing.priceDiffEur.toLocaleString("ro-MD")} €</span>
        )}
        [foto]
      </div>

      <div className="lbody">
        <div>
          <span className="ltype">
            {TYPE_LABEL[listing.listingType]}
            {listing.rooms ? ` · ${listing.rooms} ${listing.rooms === 1 ? "odaie" : "odăi"}` : ""}
          </span>
          {listing.isOwner && <span className="lprop">✓ Proprietar</span>}
          {listing.blacklist && (
            <span className="badge b-red" style={{ marginLeft: 3, fontSize: 10 }}>
              Agent ascuns
            </span>
          )}
        </div>
        <div className="laddr">
          {listing.sector ? `sec. ${listing.sector}, ` : ""}
          {listing.address}
        </div>
        {meta && <div className="lmeta">{meta}</div>}
        <div className="lprice">
          {fmtEur(listing.priceEur)}
          {oldPrice && <span className="lprice-old">{fmtEur(oldPrice)}</span>}
        </div>

        {listing.blacklist && (
          <div className="bl-warn">
            La acest număr a fost identificat un agent ascuns · semnalat de{" "}
            {listing.blacklist.reportCount} agenți
          </div>
        )}

        <div className="lacts">
          <a className="btn solid" href={listing.url} target="_blank" rel="noopener noreferrer">
            Deschide pe 999 →
          </a>
          <button className="btn" onClick={toDeal}>
            + La tranzacție
          </button>
        </div>

        {/* Триггер: показывается когда не редактируем */}
        {!editing && (
          <button
            className="btn"
            style={{
              marginTop: 7,
              width: "100%",
              justifyContent: "center",
              borderStyle: saved ? "solid" : "dashed",
              color: saved ? "var(--green)" : undefined,
              borderColor: saved ? "var(--green-br)" : undefined,
            }}
            onClick={() => setEditing(true)}
          >
            {saved ? "✎ Editați contactul salvat" : "+ Salvați contactul vânzătorului"}
          </button>
        )}
      </div>

      {/* Блок редактирования */}
      {editing && (
        <div className="priv-block">
          <div className="priv-lock">🔒 Contactul meu · vizibil doar pentru dvs.</div>
          <div className="fld">
            <label>Telefonul vânzătorului</label>
            <input
              type="text"
              placeholder="introduceți manual (de pe 999)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="fld">
            <label>Notă</label>
            <textarea
              rows={2}
              placeholder="ex.: am sunat, resunat miercuri"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
            <button className="btn solid" onClick={save} disabled={busy}>
              Salvează
            </button>
            <button className="btn" onClick={cancel} disabled={busy}>
              Anulează
            </button>
            {saved && (
              <button
                className="btn"
                onClick={remove}
                disabled={busy}
                style={{ color: "var(--red)", borderColor: "var(--red-br)", marginLeft: "auto" }}
              >
                🗑 Ștergeți
              </button>
            )}
          </div>
        </div>
      )}

      {/* Сохранённый контакт */}
      {saved && !editing && (
        <div className="priv-saved">
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--green)" }}>✓ Contact salvat</div>
          <div style={{ fontSize: 12, color: "var(--ink2)" }}>📞 {phone || "—"}</div>
          {note && (
            <div style={{ fontSize: 12, color: "var(--ink3)", fontStyle: "italic" }}>{note}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    type: null,
    sector: null,
    priceDropped: false,
    ownerOnly: false,
    priceMin: "",
    priceMax: "",
    rooms: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.type) qs.set("type", filters.type);
    if (filters.sector) qs.set("sector", filters.sector);
    if (filters.priceDropped) qs.set("priceDropped", "1");
    if (filters.ownerOnly) qs.set("ownerOnly", "1");
    if (filters.priceMin) qs.set("priceMin", filters.priceMin);
    if (filters.priceMax) qs.set("priceMax", filters.priceMax);
    if (filters.rooms) qs.set("rooms", filters.rooms);
    const r = await fetch(`/api/listings?${qs.toString()}`);
    const d = await r.json();
    setListings(d.listings ?? []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setType = (t: string | null) =>
    setFilters((f) => ({ ...f, type: f.type === t ? null : t }));
  const setSector = (s: string | null) =>
    setFilters((f) => ({ ...f, sector: f.sector === s ? null : s }));

  return (
    <div className="ig-page">
      <div className="crumb">Anunțuri · actualizate periodic</div>
      <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 8 }}>
        Anunțuri noi de la proprietari
      </h1>
      <div className="src-note">
        <b>Date:</b> platforma afișează faptele anunțului și linkul către sursă. Telefonul
        vânzătorului — pe 999. Contactul îl salvați manual în blocul privat (vizibil doar dvs.).
      </div>

      <div className="filters">
        <span
          className={`chip${!filters.type && !filters.sector && !filters.priceDropped && !filters.ownerOnly ? " on" : ""}`}
          onClick={() =>
            setFilters((f) => ({ ...f, type: null, sector: null, priceDropped: false, ownerOnly: false }))
          }
        >
          Toate
        </span>
        <span className={`chip${filters.type === "APARTAMENT" ? " on" : ""}`} onClick={() => setType("APARTAMENT")}>Apartamente</span>
        <span className={`chip${filters.type === "CASA" ? " on" : ""}`} onClick={() => setType("CASA")}>Case</span>
        <span className={`chip${filters.type === "TEREN" ? " on" : ""}`} onClick={() => setType("TEREN")}>Terenuri</span>
        {SECTORS.map((s) => (
          <span key={s} className={`chip${filters.sector === s ? " on" : ""}`} onClick={() => setSector(s)}>
            {s}
          </span>
        ))}
        <span
          className={`chip${filters.priceDropped ? " on" : ""}`}
          onClick={() => setFilters((f) => ({ ...f, priceDropped: !f.priceDropped }))}
        >
          ↓ Preț redus
        </span>
        <span
          className={`chip${filters.ownerOnly ? " on" : ""}`}
          onClick={() => setFilters((f) => ({ ...f, ownerOnly: !f.ownerOnly }))}
        >
          ✓ Proprietari
        </span>
      </div>

      <div className="filter-inputs">
        <input
          type="number"
          placeholder="Preț min €"
          value={filters.priceMin}
          onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
        />
        <input
          type="number"
          placeholder="Preț max €"
          value={filters.priceMax}
          onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
        />
        <select value={filters.rooms} onChange={(e) => setFilters((f) => ({ ...f, rooms: e.target.value }))}>
          <option value="">Camere: toate</option>
          <option value="1">1 cameră</option>
          <option value="2">2 camere</option>
          <option value="3">3 camere</option>
          <option value="4">4+ camere</option>
        </select>
      </div>

      <div className="listings">
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
      {!loading && listings.length === 0 && (
        <p style={{ color: "var(--ink3)", fontSize: 13, marginTop: 16 }}>
          Niciun anunț nu corespunde filtrelor.
        </p>
      )}
      {loading && <p style={{ color: "var(--ink3)", fontSize: 13, marginTop: 16 }}>Se încarcă…</p>}
    </div>
  );
}
