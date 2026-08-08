import { cookies } from "next/headers";
import type { FlowTx } from "@/app/app/_components/flow/types";

// Demo-режим (cookie imo_demo=1) НИКОГДА не должен писать в боевую БД. Серверная
// проверка — defense in depth: не полагаемся на клиентский isDemoMode (тот же принцип,
// что у requirePaidAccess). Ровно та же кука, что читает middleware для доступа к /app/*
// без сессии. Если запрос идёт из demo-тура — мутирующие роуты /api/transactions/*
// возвращают фиктивный успех, не создавая реальных записей (см. дыру: залогиненный
// demo-пользователь ранее писал реальные Transaction через POST /api/transactions).
export async function isDemoRequest(): Promise<boolean> {
  const jar = await cookies();
  return jar.get("imo_demo")?.value === "1";
}

// Фиктивный ID досье, который create-роут отдаёт в demo вместо реальной записи.
// GET /api/transactions/demo распознаёт его и отдаёт мок (без обращения к БД).
export const DEMO_TX_ID = "demo";

// Мок транзакции для GET /api/transactions/demo — чтобы deviation-путь тура (реальная
// форма, открытая в demo) мог отрисовать шаги без настоящей записи в базе.
export function demoFlowTx(): FlowTx {
  return {
    id: DEMO_TX_ID,
    address: null,
    cadastralNo: null,
    objectType: null,
    suprafata: null,
    destinatie: null,
    valoare: null,
    verificareImobil: null,
    dealType: "VANZARE_CUMPARARE",
    sellerType: "PERSOANA_FIZICA",
    buyerType: "PERSOANA_FIZICA",
    clientName: null,
    clientPhone: null,
    clientContractRef: null,
    clientConsentGivenAt: null,
    currentStepNumber: 1,
    completedAt: null,
    documents: [],
    extractedFields: [],
    flags: [],
    owners: [],
    notarChecklist: [],
    calculation: null,
  };
}
