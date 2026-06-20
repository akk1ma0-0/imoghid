import { TransactionFlow } from "@/app/app/_components/flow/TransactionFlow";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
};

// Существующий маршрут сделки — открывается на шаге из ?step= (по умолчанию 1).
export default async function TransactionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { step } = await searchParams;
  let n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > 8) n = 1;
  return <TransactionFlow transactionId={id} initialStep={n} />;
}
