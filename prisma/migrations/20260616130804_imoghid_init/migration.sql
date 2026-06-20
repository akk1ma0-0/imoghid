/*
  Warnings:

  - You are about to drop the `Post` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('VANZARE_CUMPARARE', 'DONATIE', 'SCHIMB', 'ALT_TIP');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('PERSOANA_FIZICA', 'PERSOANA_JURIDICA');

-- CreateEnum
CREATE TYPE "TransactionStep" AS ENUM ('DATE_OBIECT', 'INCARCARE', 'VERIFICARE_ACTE', 'COPROPRIETARI', 'LISTA_NOTAR', 'PLATI', 'RAPORT', 'PROGRAMARE_ASP');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT_VANZARE_CUMPARARE', 'CONTRACT_TRANSMITERE_PRIMIRE', 'EXTRAS_REGISTRU', 'EXTRAS_CAPITOL_SUPLIMENTAR', 'ACT_DE_DREPT', 'PASAPORT_TEHNIC', 'BULETIN_IDENTITATE', 'PROCURA', 'ACORD_SOT', 'HOTARARE_FONDATORI', 'CERTIFICAT_PRIVATIZARE', 'RAPORT_EVALUARE', 'DOVADA_PROVENIENTEI_BANILOR', 'ALT_DOCUMENT');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('RED', 'AMBER', 'GREEN');

-- CreateEnum
CREATE TYPE "FlagZone" AS ENUM ('VERIFICAT', 'VERIFICARE_MANUALA', 'IN_AFARA_ZONEI');

-- CreateEnum
CREATE TYPE "BlacklistTag" AS ENUM ('AGENT_ASCUNS', 'OBIECT_FALS');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('APARTAMENT', 'CASA', 'TEREN', 'COMERCIAL');

-- CreateEnum
CREATE TYPE "PriceChange" AS ENUM ('UP', 'DOWN', 'STABLE');

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_authorId_fkey";

-- DropTable
DROP TABLE "Post";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "agencyName" TEXT,
    "logoUrl" TEXT,
    "profilePhotoUrl" TEXT,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'BASIC',
    "planActivatedAt" TIMESTAMP(3),
    "planExpiresAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'PRO',
    "createdById" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT,
    "cadastralNo" TEXT,
    "objectType" TEXT,
    "dealType" "DealType" NOT NULL DEFAULT 'VANZARE_CUMPARARE',
    "sellerType" "PartyType" NOT NULL DEFAULT 'PERSOANA_FIZICA',
    "buyerType" "PartyType" NOT NULL DEFAULT 'PERSOANA_FIZICA',
    "clientName" TEXT,
    "clientPhone" TEXT,
    "clientContractRef" TEXT,
    "currentStep" "TransactionStep" NOT NULL DEFAULT 'DATE_OBIECT',
    "completedAt" TIMESTAMP(3),
    "listingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_documents" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "objectIndex" INTEGER NOT NULL DEFAULT 1,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "documentType" "DocumentType",
    "ocrText" TEXT,
    "hasHandwriting" BOOLEAN NOT NULL DEFAULT false,
    "typeConfidence" DOUBLE PRECISION,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_fields" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "objectIndex" INTEGER NOT NULL DEFAULT 1,
    "fieldName" TEXT NOT NULL,
    "value" TEXT,
    "sourceDocId" TEXT,
    "isActualized" BOOLEAN,

    CONSTRAINT "extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_flags" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "objectIndex" INTEGER NOT NULL DEFAULT 1,
    "severity" "FlagSeverity" NOT NULL,
    "zone" "FlagZone" NOT NULL,
    "code" TEXT NOT NULL,
    "titleRo" TEXT NOT NULL,
    "descriptionRo" TEXT,
    "legalRef" TEXT,
    "legalRefUrl" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_owners" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "objectIndex" INTEGER NOT NULL DEFAULT 1,
    "fullName" TEXT NOT NULL,
    "shareNumerator" INTEGER NOT NULL DEFAULT 1,
    "shareDenominator" INTEGER NOT NULL DEFAULT 1,
    "isActualized" BOOLEAN,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "isLegalEntity" BOOLEAN NOT NULL DEFAULT false,
    "acordSotRequired" BOOLEAN NOT NULL DEFAULT false,
    "acordSotObtained" BOOLEAN NOT NULL DEFAULT false,
    "tutorApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "tutorApprovalObtained" BOOLEAN NOT NULL DEFAULT false,
    "foundersDecisionRequired" BOOLEAN NOT NULL DEFAULT false,
    "foundersDecisionObtained" BOOLEAN NOT NULL DEFAULT false,
    "dataActualizationRequired" BOOLEAN NOT NULL DEFAULT false,
    "dataActualizationDone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "property_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notar_checklist_items" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "labelRo" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isUploaded" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notar_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_calculations" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "buyPrice" DOUBLE PRECISION,
    "sellPrice" DOUBLE PRECISION,
    "capitalGain" DOUBLE PRECISION,
    "taxBase" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "donationValue" DOUBLE PRECISION,
    "donationRelType" TEXT,
    "donationTaxAmount" DOUBLE PRECISION,
    "schimbValue1" DOUBLE PRECISION,
    "schimbValue2" DOUBLE PRECISION,
    "schimbDiff" DOUBLE PRECISION,
    "schimbTaxBase" DOUBLE PRECISION,
    "schimbTaxAmount" DOUBLE PRECISION,
    "notaryTransactionValue" DOUBLE PRECISION,
    "notaryFeeAmount" DOUBLE PRECISION,
    "notaryFeePct" DOUBLE PRECISION,
    "taxStatAmount" DOUBLE PRECISION,
    "taxStatPct" DOUBLE PRECISION,
    "notaryTotal" DOUBLE PRECISION,
    "propertyValueEur" DOUBLE PRECISION,
    "downPaymentEur" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings_999" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "listingType" "ListingType",
    "sector" TEXT,
    "address" TEXT,
    "priceEur" DOUBLE PRECISION,
    "priceMdl" DOUBLE PRECISION,
    "rooms" INTEGER,
    "areaM2" DOUBLE PRECISION,
    "floor" INTEGER,
    "totalFloors" INTEGER,
    "description" TEXT,
    "imageUrls" TEXT[],
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "ownerScore" DOUBLE PRECISION,
    "priceChange" "PriceChange" NOT NULL DEFAULT 'STABLE',
    "priceDiffEur" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "blacklistPhoneHash" TEXT,

    CONSTRAINT "listings_999_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_price_history" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "priceEur" DOUBLE PRECISION,
    "priceMdl" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_listing_contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_listing_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklist_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "tag" "BlacklistTag" NOT NULL,
    "note" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blacklist_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "titleRo" TEXT NOT NULL,
    "descriptionRo" TEXT NOT NULL,
    "legalActRo" TEXT NOT NULL,
    "legalActUrl" TEXT,
    "severity" "FlagSeverity" NOT NULL DEFAULT 'AMBER',
    "zone" "FlagZone" NOT NULL DEFAULT 'VERIFICARE_MANUALA',
    "appliesToAll" BOOLEAN NOT NULL DEFAULT true,
    "appliesTo" "DealType"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anunt_generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "outputRo" TEXT,
    "outputRu" TEXT,
    "hashtags" TEXT[],
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anunt_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeSubscriptionId_key" ON "users"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "transactions_userId_idx" ON "transactions"("userId");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE INDEX "transaction_documents_transactionId_idx" ON "transaction_documents"("transactionId");

-- CreateIndex
CREATE INDEX "extracted_fields_transactionId_idx" ON "extracted_fields"("transactionId");

-- CreateIndex
CREATE INDEX "transaction_flags_transactionId_idx" ON "transaction_flags"("transactionId");

-- CreateIndex
CREATE INDEX "property_owners_transactionId_idx" ON "property_owners"("transactionId");

-- CreateIndex
CREATE INDEX "notar_checklist_items_transactionId_idx" ON "notar_checklist_items"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_calculations_transactionId_key" ON "transaction_calculations"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_transactionId_key" ON "reports"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "listings_999_externalId_key" ON "listings_999"("externalId");

-- CreateIndex
CREATE INDEX "listings_999_sector_listingType_isOwner_isActive_idx" ON "listings_999"("sector", "listingType", "isOwner", "isActive");

-- CreateIndex
CREATE INDEX "listings_999_priceEur_idx" ON "listings_999"("priceEur");

-- CreateIndex
CREATE INDEX "listings_999_lastSeenAt_idx" ON "listings_999"("lastSeenAt");

-- CreateIndex
CREATE INDEX "listings_999_isActive_isArchived_idx" ON "listings_999"("isActive", "isArchived");

-- CreateIndex
CREATE INDEX "listing_price_history_listingId_idx" ON "listing_price_history"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_listing_contacts_userId_listingId_key" ON "saved_listing_contacts"("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "blacklist_reports_phoneHash_key" ON "blacklist_reports"("phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "legal_rules_code_key" ON "legal_rules"("code");

-- CreateIndex
CREATE INDEX "anunt_generations_userId_idx" ON "anunt_generations"("userId");

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings_999"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_flags" ADD CONSTRAINT "transaction_flags_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notar_checklist_items" ADD CONSTRAINT "notar_checklist_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notar_checklist_items" ADD CONSTRAINT "notar_checklist_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "transaction_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_calculations" ADD CONSTRAINT "transaction_calculations_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings_999" ADD CONSTRAINT "listings_999_blacklistPhoneHash_fkey" FOREIGN KEY ("blacklistPhoneHash") REFERENCES "blacklist_reports"("phoneHash") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings_999"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listing_contacts" ADD CONSTRAINT "saved_listing_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listing_contacts" ADD CONSTRAINT "saved_listing_contacts_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings_999"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklist_reports" ADD CONSTRAINT "blacklist_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anunt_generations" ADD CONSTRAINT "anunt_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
