import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { getActeTemplate, loadOriginalTemplateText } from "@/lib/acte-templates";

type Params = { params: Promise<{ slug: string }> };

// GET /api/documents/[slug]
// Возвращает сохранённую версию пользователя (personalized:true) либо оригинал
// шаблона (personalized:false), сконвертированный из docs/templates/ на сервере.
export async function GET(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { slug } = await params;

  const tpl = getActeTemplate(slug);
  if (!tpl) return NextResponse.json({ error: "Document negăsit." }, { status: 404 });

  const saved = await prisma.userDocument.findUnique({
    where: { userId_documentSlug: { userId: sess.userId, documentSlug: slug } },
  });
  if (saved) {
    return NextResponse.json({
      slug,
      title: tpl.title,
      content: saved.content,
      personalized: true,
      updatedAt: saved.updatedAt,
    });
  }

  try {
    const content = await loadOriginalTemplateText(tpl);
    return NextResponse.json({
      slug,
      title: tpl.title,
      content,
      personalized: false,
      updatedAt: null,
    });
  } catch (err) {
    console.error("[documents] eroare la citirea șablonului original:", err);
    return NextResponse.json(
      { error: "Nu s-a putut încărca șablonul original." },
      { status: 500 },
    );
  }
}

// PUT /api/documents/[slug] — сохраняет/обновляет версию пользователя (upsert).
export async function PUT(req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { slug } = await params;

  const tpl = getActeTemplate(slug);
  if (!tpl) return NextResponse.json({ error: "Document negăsit." }, { status: 404 });

  let body: { content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "Conținut invalid." }, { status: 400 });
  }

  const saved = await prisma.userDocument.upsert({
    where: { userId_documentSlug: { userId: sess.userId, documentSlug: slug } },
    create: { userId: sess.userId, documentSlug: slug, content: body.content },
    update: { content: body.content },
  });
  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
}

// DELETE /api/documents/[slug] — удаляет версию пользователя (сброс к оригиналу).
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { slug } = await params;

  if (!getActeTemplate(slug)) {
    return NextResponse.json({ error: "Document negăsit." }, { status: 404 });
  }

  await prisma.userDocument.deleteMany({
    where: { userId: sess.userId, documentSlug: slug },
  });
  return NextResponse.json({ ok: true });
}
