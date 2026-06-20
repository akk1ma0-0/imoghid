import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { isTemplateName, generateDoc, TEMPLATES } from "@/lib/templates";

// POST /api/tools/generate-doc { templateName: 'garantie'|'contract', data } → .docx файл.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  if (!isTemplateName(body.templateName)) {
    return NextResponse.json({ error: "Șablon necunoscut." }, { status: 400 });
  }
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, string>)
      : {};

  let buffer: Buffer;
  try {
    buffer = generateDoc(body.templateName, data);
  } catch (err) {
    console.error("[tools] generate-doc error:", err);
    return NextResponse.json({ error: "Eroare la generarea documentului." }, { status: 500 });
  }

  const fileName = `${TEMPLATES[body.templateName].outName}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
