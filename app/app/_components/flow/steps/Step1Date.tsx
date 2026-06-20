import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEAL_TYPES, type DealCode } from "../constants";
import type { FlowTx } from "../types";

const OBJECT_TYPES = ["Apartament", "Casă", "Teren", "Comercial"];
// Шаг 1 предлагает только эти типы (без «Alt tip»).
const STEP1_DEAL_TYPES = DEAL_TYPES.filter((d) => d.code !== "ALT_TIP");

// Шаг 1. tx=null → создание (POST); tx задан → редактирование (PATCH). onNext(id) ведёт на шаг 2.
export function Step1Date({
  tx,
  prefill,
  onNext,
}: {
  tx: FlowTx | null;
  prefill?: {
    address?: string;
    objectType?: string;
    cadastralNo?: string;
    fromCadastru?: boolean;
    suprafata?: string;
    destinatie?: string;
    valoare?: string;
  };
  onNext: (id: string) => void;
}) {
  const router = useRouter();
  // Obiect 1 (основной, сохраняется в транзакцию)
  const [address, setAddress] = useState(tx?.address ?? prefill?.address ?? "");
  const [cadastralNo, setCadastralNo] = useState(
    tx?.cadastralNo ?? prefill?.cadastralNo ?? "",
  );
  const [objectType, setObjectType] = useState(
    tx?.objectType ?? prefill?.objectType ?? "Apartament",
  );
  // Необязательные поля (колонки suprafata/destinatie/valoare в Transaction). Префилл из БД (существующая) или Verificare imobil (новая).
  const [suprafata, setSuprafata] = useState(tx?.suprafata ?? prefill?.suprafata ?? "");
  const [destinatie, setDestinatie] = useState(tx?.destinatie ?? prefill?.destinatie ?? "");
  const [valoare, setValoare] = useState(tx?.valoare ?? prefill?.valoare ?? "");
  // Obiect 2 (только для Schimb; в схеме нет отдельных колонок — UI/локально, objectIndex=2 в шагах 2–4)
  const [address2, setAddress2] = useState("");
  const [cadastralNo2, setCadastralNo2] = useState("");
  const [objectType2, setObjectType2] = useState("Apartament");

  const showCadBanner = !tx && prefill?.fromCadastru && (prefill.address || prefill.cadastralNo);
  const [dealType, setDealType] = useState<DealCode>(tx?.dealType ?? "VANZARE_CUMPARARE");
  const isSchimb = dealType === "SCHIMB";

  const [clientName, setClientName] = useState(tx?.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(tx?.clientPhone ?? "");
  const [clientContractRef, setClientContractRef] = useState(tx?.clientContractRef ?? "");
  const [contractFileName, setContractFileName] = useState<string | null>(null);
  const contractFileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (!address.trim() && !cadastralNo.trim()) {
      setError("Introduceți adresa sau numărul cadastral.");
      return;
    }
    setBusy(true);
    const payload = {
      address,
      cadastralNo,
      objectType,
      suprafata,
      destinatie,
      valoare,
      dealType,
      clientName,
      clientPhone,
      clientContractRef,
    };
    try {
      if (tx) {
        const r = await fetch(`/api/transactions/${tx.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error();
        onNext(tx.id);
      } else {
        const r = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error);
        onNext(d.id);
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Eroare la salvare.");
    } finally {
      setBusy(false);
    }
  }

  const dealTypeButtons = (
    <div className="type-grid">
      {STEP1_DEAL_TYPES.map((d) => (
        <button
          key={d.code}
          className={`type-btn${dealType === d.code ? " on" : ""}`}
          onClick={() => setDealType(d.code)}
          type="button"
        >
          {d.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {showCadBanner && (
        <div className="notice blue" style={{ marginBottom: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>Date completate din verificarea imobilului</b>
            <p style={{ margin: "2px 0 0", fontSize: 11.5 }}>
              {[prefill?.address, prefill?.cadastralNo].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="notice red" style={{ marginBottom: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>{error}</b>
          </div>
        </div>
      )}

      {/* ── Obiect: один (стандарт) или два (Schimb) ── */}
      {!isSchimb ? (
        <div className="card">
          <div className="card-hd">
            <b>Obiect</b>
          </div>
          <div className="card-bd">
            <div className="field-group">
              <label>Adresa obiectului</label>
              <input
                type="text"
                placeholder="str. Independenței 42, ap. 7, Chișinău"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Număr cadastral</label>
                <input
                  type="text"
                  placeholder="0100225.041.0212"
                  value={cadastralNo}
                  onChange={(e) => setCadastralNo(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Tip obiect</label>
                <select value={objectType} onChange={(e) => setObjectType(e.target.value)}>
                  {OBJECT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-row-3">
              <div className="field-group">
                <label>Suprafață (m²) <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span></label>
                <input type="text" placeholder="66.80" value={suprafata} onChange={(e) => setSuprafata(e.target.value)} />
              </div>
              <div className="field-group">
                <label>Destinație <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span></label>
                <input type="text" placeholder="Locativă" value={destinatie} onChange={(e) => setDestinatie(e.target.value)} />
              </div>
              <div className="field-group">
                <label>Valoare evaluare <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span></label>
                <input type="text" placeholder="344 020 lei" value={valoare} onChange={(e) => setValoare(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label>Tip tranzacție</label>
              {dealTypeButtons}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="obj2-grid">
            {/* Obiect 1 */}
            <div className="card">
              <div className="card-hd">
                <b>Obiect 1</b>
              </div>
              <div className="card-bd">
                <div className="field-group">
                  <label>Adresa obiectului</label>
                  <input
                    type="text"
                    placeholder="str. Independenței 42, ap. 7, Chișinău"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>Număr cadastral</label>
                  <input
                    type="text"
                    placeholder="0100225.041.0212"
                    value={cadastralNo}
                    onChange={(e) => setCadastralNo(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>Tip obiect</label>
                  <select value={objectType} onChange={(e) => setObjectType(e.target.value)}>
                    {OBJECT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {/* Obiect 2 */}
            <div className="card">
              <div className="card-hd">
                <b>Obiect 2</b>
              </div>
              <div className="card-bd">
                <div className="field-group">
                  <label>Adresa obiectului</label>
                  <input
                    type="text"
                    placeholder="str. Decebal 99/D, ap. 40, Chișinău"
                    value={address2}
                    onChange={(e) => setAddress2(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>Număr cadastral</label>
                  <input
                    type="text"
                    placeholder="0100110.477.05.040"
                    value={cadastralNo2}
                    onChange={(e) => setCadastralNo2(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>Tip obiect</label>
                  <select value={objectType2} onChange={(e) => setObjectType2(e.target.value)}>
                    {OBJECT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn"
                  type="button"
                  style={{ width: "100%", marginTop: 4, justifyContent: "center" }}
                  onClick={() => router.push("/app/cadastru")}
                >
                  Verifică obiect →
                </button>
              </div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-hd">
              <b>Tip tranzacție</b>
            </div>
            <div className="card-bd">{dealTypeButtons}</div>
          </div>
        </>
      )}

      {/* ── Client ── */}
      <div className="card">
        <div className="card-hd">
          <b>Client</b>
        </div>
        <div className="card-bd">
          <div className="field-row">
            <div className="field-group">
              <label>Numele clientului</label>
              <input
                type="text"
                placeholder="Popescu Ion"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>Telefon</label>
              <input
                type="text"
                placeholder="+373 69 000 000"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="field-group">
            <label>Contract cu clientul (opțional)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="numărul contractului..."
                style={{ flex: 1 }}
                value={clientContractRef}
                onChange={(e) => setClientContractRef(e.target.value)}
              />
              <input
                ref={contractFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: "none" }}
                onChange={(e) => setContractFileName(e.target.files?.[0]?.name ?? null)}
              />
              <button
                className="btn"
                type="button"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => contractFileRef.current?.click()}
              >
                📎 Încărcați fișierul
              </button>
            </div>
            {contractFileName && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink2)" }}>
                📄 {contractFileName}
              </div>
            )}
          </div>
        </div>
      </div>

      <button className="btn solid" onClick={save} disabled={busy}>
        {busy ? "Se salvează…" : "Continuați → încărcați documentele"}
      </button>
    </div>
  );
}
