-- Снимок плательщика для записи транзакции (договор с банком EC7122/231126).
-- Аддитивно, nullable, без бэкфилла.
ALTER TABLE "payments"
  ADD COLUMN "payerName"   TEXT,
  ADD COLUMN "payerPhone"  TEXT,
  ADD COLUMN "payerIp"     TEXT,
  ADD COLUMN "description" TEXT;
