import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";
import { analysisLimit, isPastMonth } from "@/lib/analysis-limits";
import { analyzeDocuments, type VerificareImobilData } from "@/lib/claude";
import { isInheritanceBasis, parseOwnerCota } from "@/lib/analyze/flags";

type Params = { params: Promise<{ id: string }> };

// POST /api/transactions/[id]/analyze — анализ документов Claude (Pasul 3) → ExtractedField + TransactionFlag + owners.
export async function POST(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId, {
    documents: { orderBy: { uploadedAt: "asc" } },
  });
  if (!tx) return notFound();
  if (tx.documents.length === 0) {
    return NextResponse.json(
      { error: "Încărcați documente înainte de verificare." },
      { status: 400 },
    );
  }

  // ── Лимит анализов по плану (месячный сброс) ──
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { plan: true, analysisCount: true, analysisCountResetAt: true },
  });
  if (!user) return notFound();

  const limit = analysisLimit(user.plan);
  const now = new Date();
  let count = user.analysisCount;
  let resetAt = user.analysisCountResetAt;
  if (isPastMonth(resetAt, now)) {
    count = 0;
    resetAt = now;
  }
  if (count >= limit) {
    return NextResponse.json(
      {
        error: `Ați atins limita de ${limit} analize pe lună (plan ${user.plan}).${
          user.plan === "BASIC"
            ? " Treceți la planul PRO pentru 100 de analize pe lună."
            : " Limita se resetează la începutul lunii următoare."
        }`,
        usage: { used: count, limit, plan: user.plan },
      },
      { status: 429 },
    );
  }
  // Инкрементируем счётчик (с учётом возможного сброса) до выполнения анализа.
  await prisma.user.update({
    where: { id: sess.userId },
    data: { analysisCount: count + 1, analysisCountResetAt: resetAt },
  });

  const indices = tx.dealType === "SCHIMB" ? [1, 2] : [1];
  const docByIndex = (idx: number) => tx.documents.filter((d) => d.objectIndex === idx);

  // Данные Verificare imobil (substitut выписки RBI) для основного объекта (objectIndex=1).
  let verificareByIndex: Record<number, VerificareImobilData | null> | undefined;
  if (tx.verificareImobil) {
    try {
      verificareByIndex = { 1: JSON.parse(tx.verificareImobil) as VerificareImobilData };
    } catch {
      verificareByIndex = undefined;
    }
  }

  // Один вызов Claude на всю транзакцию (для SCHIMB — оба объекта). Вне DB-транзакции.
  const analysis = await analyzeDocuments(
    indices.map((idx) => ({
      objectIndex: idx,
      docs: docByIndex(idx).map((d) => ({
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
      })),
    })),
    tx.dealType,
    verificareByIndex,
  );

  const rules = await prisma.legalRule.findMany();
  const ruleMap = new Map(rules.map((r) => [r.code, r]));

  await prisma.$transaction(async (db) => {
    await db.extractedField.deleteMany({ where: { transactionId: id } });
    await db.transactionFlag.deleteMany({ where: { transactionId: id } });

    for (const obj of analysis.objects) {
      const idx = obj.objectIndex;
      const docId = docByIndex(idx)[0]?.id ?? null;

      // ── ExtractedField ──
      const efRows = obj.extractedFields
        .filter((f) => f.value !== null && f.value !== undefined)
        .map((f) => ({
          transactionId: id,
          objectIndex: idx,
          fieldName: f.fieldName,
          value: f.value,
          sourceDocId: docId,
          isActualized: f.isActualized,
        }));
      if (efRows.length) await db.extractedField.createMany({ data: efRows });

      // ── Flag-uri din Verificare imobil (substitut extras RBI) ──
      // Dacă există drepturi/notări/interdicții → semnal concret, nu «necunoscut».
      const ver = verificareByIndex?.[idx];
      if (ver) {
        const verFlags: { on: boolean; code: string; severity: "AMBER" | "RED"; titleRo: string; descriptionRo: string }[] = [
          { on: !!ver.alteDrepturiReale, code: "VER_ALTE_DREPTURI", severity: "AMBER", titleRo: "Alte drepturi reale — există (Verificare imobil)", descriptionRo: "Verificarea imobilului a semnalat alte drepturi reale. Clarificați natura lor înainte de notar." },
          { on: !!ver.notari, code: "VER_NOTARI", severity: "AMBER", titleRo: "Notări — există (Verificare imobil)", descriptionRo: "Verificarea imobilului a semnalat notări în registru. Verificați conținutul lor." },
          { on: !!ver.interdictii, code: "VER_INTERDICTII", severity: "RED", titleRo: "Interdicții — există (Verificare imobil)", descriptionRo: "Verificarea imobilului a semnalat interdicții. Acestea pot bloca tranzacția — clarificați obligatoriu." },
        ];
        for (const vf of verFlags) {
          if (!vf.on) continue;
          await db.transactionFlag.create({
            data: {
              transactionId: id,
              objectIndex: idx,
              severity: vf.severity,
              zone: "VERIFICARE_MANUALA",
              code: vf.code,
              titleRo: vf.titleRo,
              descriptionRo: vf.descriptionRo,
              legalRef: null,
              legalRefUrl: null,
            },
          });
        }
      }

      // ── TransactionFlag ── (severity/zone уже нормализованы; legalRefUrl — из LegalRule по code) ──
      for (const f of obj.flags) {
        const rule = ruleMap.get(f.code);
        await db.transactionFlag.create({
          data: {
            transactionId: id,
            objectIndex: idx,
            severity: f.severity,
            zone: f.zone,
            code: f.code,
            titleRo: f.titleRo,
            descriptionRo: f.descriptionRo,
            legalRef: f.legalRef ?? rule?.legalActRo ?? null,
            legalRefUrl: rule?.legalActUrl ?? null,
          },
        });
      }

      // ── PropertyOwner ── (из extractedFields owner_name; галочки агента сохраняем) ──
      const ownerEntries = obj.extractedFields.filter(
        (f) => f.fieldName === "owner_name" && f.value,
      );
      const hasLegalEntity = obj.flags.some((f) => f.code === "LEGAL_ENTITY_SELLER");
      // Наследство → личная собственность: согласие супруга НЕ требуется (Cod civil 371(1)(b)).
      const legalBasis = obj.extractedFields.find((f) => f.fieldName === "legal_basis")?.value ?? null;
      const inherited = isInheritanceBasis(legalBasis);
      const needConsent =
        !inherited &&
        (obj.flags.some((f) => f.code === "MARRIED_CONSENT_NEEDED") ||
          (tx.sellerType === "PERSOANA_FIZICA" &&
            (tx.dealType === "VANZARE_CUMPARARE" || tx.dealType === "SCHIMB")));
      // Извлекаем имя + долю (cotă) из каждого owner_name. Доля не найдена → null («–»).
      const parsedOwners = ownerEntries
        .map((e) => {
          const { name, cota } = parseOwnerCota(e.value!.trim());
          return { name, cota, isActualized: e.isActualized };
        })
        .filter((o) => o.name);
      const keep = new Set(parsedOwners.map((o) => o.name));

      for (const po of parsedOwners) {
        const fullName = po.name;
        const actualized = po.isActualized;
        const existing = await db.propertyOwner.findFirst({
          where: { transactionId: id, objectIndex: idx, fullName },
        });
        if (existing) {
          await db.propertyOwner.update({
            where: { id: existing.id },
            data: {
              isActualized: actualized,
              isLegalEntity: hasLegalEntity,
              cota: po.cota,
              dataActualizationRequired: actualized === false,
            },
          });
        } else {
          await db.propertyOwner.create({
            data: {
              transactionId: id,
              objectIndex: idx,
              fullName,
              cota: po.cota,
              isActualized: actualized,
              isLegalEntity: hasLegalEntity,
              acordSotRequired: needConsent,
              foundersDecisionRequired: hasLegalEntity,
              dataActualizationRequired: actualized === false,
            },
          });
        }
      }
      const current = await db.propertyOwner.findMany({
        where: { transactionId: id, objectIndex: idx },
        select: { id: true, fullName: true },
      });
      const stale = current.filter((o) => !keep.has(o.fullName.trim())).map((o) => o.id);
      if (stale.length) await db.propertyOwner.deleteMany({ where: { id: { in: stale } } });
    }

    // Частичное распознавание: показываем предупреждение ТОЛЬКО когда эскалация
    // именно про нечитаемость (скан плохого качества / рукописный текст), а не про
    // содержательные юридические вопросы (которые тоже идут через escalations).
    const unreadable = analysis.escalations.some((e) =>
      /nu (a|au) putut fi citit|ilizibil|calitate (slab|proast)|scris de m[âa]n|scanat|necitibil/i.test(
        e.reason,
      ),
    );
    if (unreadable) {
      await db.transactionFlag.create({
        data: {
          transactionId: id,
          objectIndex: 1,
          severity: "AMBER",
          zone: "VERIFICARE_MANUALA",
          code: "SCAN_PARTIAL",
          titleRo: "Unele câmpuri nu au putut fi citite automat din document scanat.",
          descriptionRo: "Verificați și completați manual dacă este necesar.",
          legalRef: null,
          legalRefUrl: null,
        },
      });
    }
  });

  // Свежее состояние для рендера шага 3.
  const [extractedFields, flags, owners] = await Promise.all([
    prisma.extractedField.findMany({ where: { transactionId: id } }),
    prisma.transactionFlag.findMany({
      where: { transactionId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.propertyOwner.findMany({
      where: { transactionId: id },
      orderBy: { objectIndex: "asc" },
    }),
  ]);

  return NextResponse.json({
    extractedFields,
    flags,
    owners,
    escalations: analysis.escalations,
    summary: analysis.summary,
    usage: { used: count + 1, limit, plan: user.plan },
  });
}
