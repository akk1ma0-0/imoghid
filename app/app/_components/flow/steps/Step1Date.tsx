import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEAL_TYPES, type DealCode } from "../constants";
import type { FlowTx } from "../types";

const OBJECT_TYPES = ["Apartament", "Casă", "Teren", "Comercial"];
// Шаг 1 предлагает только эти типы (без «Alt tip»).
const STEP1_DEAL_TYPES = DEAL_TYPES.filter((d) => d.code !== "ALT_TIP");

// Ключ черновика формы (sessionStorage) для round-trip Шаг 1 ↔ Verificare imobil.
// Сохраняет ВСЮ форму (оба объекта + dealType + клиент), чтобы при возврате с
// заполнением одного объекта второй не терялся.
const DRAFT_KEY = "step1_draft";

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
  const [cadastralNo, setCadastralNo] = useState(tx?.cadastralNo ?? prefill?.cadastralNo ?? "");
  const [objectType, setObjectType] = useState(tx?.objectType ?? prefill?.objectType ?? "Apartament");
  const [suprafata, setSuprafata] = useState(tx?.suprafata ?? prefill?.suprafata ?? "");
  const [destinatie, setDestinatie] = useState(tx?.destinatie ?? prefill?.destinatie ?? "");
  const [valoare, setValoare] = useState(tx?.valoare ?? prefill?.valoare ?? "");
  // Obiect 2 (только для Schimb; в схеме нет отдельных колонок — UI/локально, objectIndex=2 в шагах 2–4)
  const [address2, setAddress2] = useState("");
  const [cadastralNo2, setCadastralNo2] = useState("");
  const [objectType2, setObjectType2] = useState("Apartament");
  const [suprafata2, setSuprafata2] = useState("");
  const [destinatie2, setDestinatie2] = useState("");
  const [valoare2, setValoare2] = useState("");

  const [dealType, setDealType] = useState<DealCode>(tx?.dealType ?? "VANZARE_CUMPARARE");
  const [fromCad, setFromCad] = useState(!!prefill?.fromCadastru);
  const isSchimb = dealType === "SCHIMB";
  const showCadBanner = !tx && fromCad && (address || cadastralNo || address2 || cadastralNo2);

  const [clientName, setClientName] = useState(tx?.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(tx?.clientPhone ?? "");
  const [clientContractRef, setClientContractRef] = useState(tx?.clientContractRef ?? "");
  const [contractFileName, setContractFileName] = useState<string | null>(null);
  const contractFileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Гидратация черновика после возврата из Verificare imobil (только для новой транзакции).
  useEffect(() => {
    if (tx) return;
    let d: Record<string, string | boolean> | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      d = JSON.parse(raw);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      return;
    }
    if (!d) return;
    const s = (k: string) => (typeof d![k] === "string" ? (d![k] as string) : undefined);
    if (s("dealType")) setDealType(s("dealType") as DealCode);
    if (s("address") !== undefined) setAddress(s("address")!);
    if (s("cadastralNo") !== undefined) setCadastralNo(s("cadastralNo")!);
    if (s("objectType")) setObjectType(s("objectType")!);
    if (s("suprafata") !== undefined) setSuprafata(s("suprafata")!);
    if (s("destinatie") !== undefined) setDestinatie(s("destinatie")!);
    if (s("valoare") !== undefined) setValoare(s("valoare")!);
    if (s("address2") !== undefined) setAddress2(s("address2")!);
    if (s("cadastralNo2") !== undefined) setCadastralNo2(s("cadastralNo2")!);
    if (s("objectType2")) setObjectType2(s("objectType2")!);
    if (s("suprafata2") !== undefined) setSuprafata2(s("suprafata2")!);
    if (s("destinatie2") !== undefined) setDestinatie2(s("destinatie2")!);
    if (s("valoare2") !== undefined) setValoare2(s("valoare2")!);
    if (s("clientName") !== undefined) setClientName(s("clientName")!);
    if (s("clientPhone") !== undefined) setClientPhone(s("clientPhone")!);
    if (s("clientContractRef") !== undefined) setClientContractRef(s("clientContractRef")!);
    if (d.fromCadastru) setFromCad(true);
  }, [tx]);

  // «Verifică obiect →»: сохраняем всю форму в черновик и уходим в Verificare imobil
  // с указанием, какой объект потом заполнить (object1 / object2).
  function goVerify(target: "object1" | "object2") {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          dealType,
          fromCadastru: fromCad,
          address, cadastralNo, objectType, suprafata, destinatie, valoare,
          address2, cadastralNo2, objectType2, suprafata2, destinatie2, valoare2,
          clientName, clientPhone, clientContractRef,
        }),
      );
    } catch {
      /* ignore */
    }
    router.push(`/app/cadastru?target=${target}`);
  }

  async function save() {
    setError(null);
    if (!address.trim() && !cadastralNo.trim()) {
      setError("Introduceți adresa sau numărul cadastral.");
      return;
    }
    setBusy(true);
    const payload = {
      address, cadastralNo, objectType, suprafata, destinatie, valoare,
      dealType, clientName, clientPhone, clientContractRef,
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

  const optLabel = (t: string) => (
    <label>
      {t} <span style={{ fontWeight: 400, color: "var(--ink3)" }}>opțional</span>
    </label>
  );

  const verifyBtn = (target: "object1" | "object2") => (
    <button
      className="btn"
      type="button"
      style={{ width: "100%", marginTop: 4, justifyContent: "center" }}
      onClick={() => goVerify(target)}
    >
      Verifică obiect →
    </button>
  );

  return (
    <div>
      {showCadBanner && (
        <div className="notice blue" style={{ marginBottom: 12 }}>
          <div className="notice-dot" />
          <div>
            <b>Date completate din verificarea imobilului</b>
            <p style={{ margin: "2px 0 0", fontSize: 11.5 }}>
              {[address, cadastralNo, address2, cadastralNo2].filter(Boolean).join(" · ")}
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
                placeholder="Chișinău, str. Independenței 42, ap. 7"
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
                {optLabel("Suprafață (m²)")}
                <input type="text" placeholder="66.80" value={suprafata} onChange={(e) => setSuprafata(e.target.value)} />
              </div>
              <div className="field-group">
                {optLabel("Destinație")}
                <input type="text" placeholder="Locativă" value={destinatie} onChange={(e) => setDestinatie(e.target.value)} />
              </div>
              <div className="field-group">
                {optLabel("Valoare evaluare")}
                <input type="text" placeholder="344 020 lei" value={valoare} onChange={(e) => setValoare(e.target.value)} />
              </div>
            </div>
            {verifyBtn("object1")}
            <div className="field-group" style={{ marginTop: 12 }}>
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
                  <input type="text" placeholder="Chișinău, str. Independenței 42, ap. 7" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Număr cadastral</label>
                    <input type="text" placeholder="0100225.041.0212" value={cadastralNo} onChange={(e) => setCadastralNo(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label>Tip obiect</label>
                    <select value={objectType} onChange={(e) => setObjectType(e.target.value)}>
                      {OBJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-group">
                  {optLabel("Suprafață (m²)")}
                  <input type="text" placeholder="66.80" value={suprafata} onChange={(e) => setSuprafata(e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field-group">
                    {optLabel("Destinație")}
                    <input type="text" placeholder="Locativă" value={destinatie} onChange={(e) => setDestinatie(e.target.value)} />
                  </div>
                  <div className="field-group">
                    {optLabel("Valoare")}
                    <input type="text" placeholder="344 020 lei" value={valoare} onChange={(e) => setValoare(e.target.value)} />
                  </div>
                </div>
                {verifyBtn("object1")}
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
                  <input type="text" placeholder="Chișinău, str. Decebal 99/D, ap. 40" value={address2} onChange={(e) => setAddress2(e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Număr cadastral</label>
                    <input type="text" placeholder="0100110.477.05.040" value={cadastralNo2} onChange={(e) => setCadastralNo2(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label>Tip obiect</label>
                    <select value={objectType2} onChange={(e) => setObjectType2(e.target.value)}>
                      {OBJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-group">
                  {optLabel("Suprafață (m²)")}
                  <input type="text" placeholder="58.40" value={suprafata2} onChange={(e) => setSuprafata2(e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field-group">
                    {optLabel("Destinație")}
                    <input type="text" placeholder="Locativă" value={destinatie2} onChange={(e) => setDestinatie2(e.target.value)} />
                  </div>
                  <div className="field-group">
                    {optLabel("Valoare")}
                    <input type="text" placeholder="290 000 lei" value={valoare2} onChange={(e) => setValoare2(e.target.value)} />
                  </div>
                </div>
                {verifyBtn("object2")}
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
              <input type="text" placeholder="Popescu Ion" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Telefon</label>
              <input type="text" placeholder="+373 69 000 000" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
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
