import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "./landing.css";
import { auth } from "@/auth";
import { MerchantFooter } from "@/components/MerchantFooter";
import { PLAN_PRICING } from "@/lib/payments";
import { AGENCY_MIN_SEATS, AGENCY_SEAT_FEE_MDL, SINGLE_ACCESS_FEE_MDL } from "@/lib/plan-limits";

export const metadata: Metadata = {
  title: "ImoGhid · Platforma agentului imobiliar",
  description:
    "ImoGhid — verificarea imobilului după număr cadastral, ghidul tranzacției imobiliare în 8 pași, examinarea dosarului și acte gata completate pentru agenții imobiliari din Republica Moldova.",
  alternates: { canonical: "/" },
};

// Публичная стартовая страница (без входа): описание сервиса, тарифы, ссылки на юр. документы,
// реквизиты продавца (банк требует их на публичной странице). Для залогиненных и demo-режима
// поведение прежнее: «/» → /app. Тарифы берутся из каталога lib/payments.ts + lib/plan-limits.ts.
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const isDemo = (await cookies()).get("imo_demo")?.value === "1";
  if (session?.user?.id || isDemo) redirect("/app");

  const tariffs = [
    { name: PLAN_PRICING.BASIC.label, price: PLAN_PRICING.BASIC.amount, unit: "MDL / lună", text: "Verificări cadastrale, examinarea dosarului, Check-list acte, Actele mele și Creator Hub — pentru agentul care lucrează individual." },
    { name: PLAN_PRICING.PRO.label, price: PLAN_PRICING.PRO.amount, unit: "MDL / lună", text: "Verificări cadastrale nelimitate, limite mai mari pentru dosare și Creator Hub, plus Anunțuri 999." },
    { name: "HUB / Agenție", price: AGENCY_SEAT_FEE_MDL, unit: `MDL / loc / lună (minim ${AGENCY_MIN_SEATS} locuri)`, text: "Pentru agenții cu mai mulți agenți: un abonament comun, coduri de invitație pentru fiecare loc." },
    { name: "O accesare", price: SINGLE_ACCESS_FEE_MDL, unit: "MDL, plată unică", text: "O verificare cadastrală, o examinare a dosarului și un obiect — fără abonament." },
  ];

  return (
    <div className="lp">
      <header className="lp-top">
        <Link href="/" className="lp-brand">
          <span className="lp-logo">IG</span>
          ImoGhid
        </Link>
        <div className="lp-actions">
          <Link href="/login" className="lp-btn">Autentificare</Link>
          <Link href="/register" className="lp-btn solid">Înregistrare</Link>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero">
          <h1>Platforma agentului imobiliar din Moldova</h1>
          <p>
            ImoGhid ajută agenții imobiliari să pregătească tranzacția: verifică imobilul după numărul cadastral, conduce
            dosarul pas cu pas, examinează actele și completează documentele standard. Platforma sugerează, nu decide —
            concluziile finale aparțin specialistului.
          </p>
          <div className="lp-actions">
            <Link href="/register" className="lp-btn solid">Creați un cont</Link>
            <Link href="/app/pending" className="lp-btn">Vezi planurile și prețurile</Link>
          </div>
        </section>

        <section className="lp-sec">
          <h2>Ce face ImoGhid</h2>
          <div className="lp-grid">
            <div className="lp-card"><h3>Verificare imobil</h3><p>Căutare după număr cadastral sau adresă: interdicții, notări și alte drepturi, din sursa oficială.</p></div>
            <div className="lp-card"><h3>Ghidul tranzacției</h3><p>Traseul tranzacției în 8 pași: date, documente, coproprietari, listă pentru notar, plăți, raport.</p></div>
            <div className="lp-card"><h3>Examinarea dosarului</h3><p>Compară documentele încărcate cu datele oficiale și semnalează riscurile.</p></div>
            <div className="lp-card"><h3>Actele mele și Creator Hub</h3><p>Șabloane de contracte completate automat și texte pentru anunțuri și rețele sociale.</p></div>
          </div>
        </section>

        <section className="lp-sec" id="tarife">
          <h2>Tarife</h2>
          <div className="lp-grid">
            {tariffs.map((t) => (
              <div className="lp-card" key={t.name}>
                <h3>{t.name}</h3>
                <div className="lp-price">{t.price} <small>{t.unit}</small></div>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
          <p className="lp-note">
            Prețurile nu includ TVA (furnizorul nu este plătitor de TVA). Plata se face cu cardul Visa sau Mastercard.
            Abonamentul se reînnoiește lunar; îl puteți dezactiva oricând din cont. Detalii:{" "}
            <Link href="/termeni#plata-si-rambursare">Plată și rambursare</Link>.
          </p>
        </section>

        <section className="lp-sec">
          <h2>Informații</h2>
          <div className="lp-links">
            <Link href="/termeni">Termeni și Condiții</Link>
            <Link href="/confidentialitate">Politică de confidențialitate</Link>
            <Link href="/faq">Întrebări frecvente</Link>
            <Link href="/despre">Despre ImoGhid</Link>
          </div>
        </section>
      </main>

      <MerchantFooter />
    </div>
  );
}
