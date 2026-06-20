import { TransactionFlow } from "@/app/app/_components/flow/TransactionFlow";

type Props = {
  searchParams: Promise<{
    address?: string;
    objectType?: string;
    cad?: string;
    from?: string;
    supr?: string;
    dest?: string;
    val?: string;
  }>;
};

// Новый маршрут сделки — шаг 1. Поддерживает префилл из «+ La tranzacție» (999) и из Verificare cadastru.
export default async function NewTransactionPage({ searchParams }: Props) {
  const { address, objectType, cad, from, supr, dest, val } = await searchParams;
  return (
    <TransactionFlow
      initialStep={1}
      prefill={{
        address,
        objectType,
        cadastralNo: cad,
        fromCadastru: from === "cadastru",
        suprafata: supr,
        destinatie: dest,
        valoare: val,
      }}
    />
  );
}
