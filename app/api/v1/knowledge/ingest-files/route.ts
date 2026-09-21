import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { ingestOkf, InvalidOKFDocument, wrapAsOkf } from "@/lib/knowledge";
import { assignConceptIds } from "@/lib/knowledge-ids";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

type UploadedFile = {
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
};

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const form = await req.formData().catch(() => null);
  // Cast rather than `instanceof File` — Node's global File (buffer) and the
  // fetch-spec File type FormData actually returns don't structurally match
  // in this tsconfig (no "dom" lib). Non-string entries are always files here
  // since the client only ever appends File objects under "files".
  const files = (form?.getAll("files") ?? []).filter((f) => typeof f !== "string") as unknown as UploadedFile[];
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const conceptIds = assignConceptIds(files.map((file) => file.name));

  const results = await Promise.all(
    files.map(async (file, index) => {
      const conceptId = conceptIds[index];
      try {
        let raw: string;
        if (file.name.toLowerCase().endsWith(".pdf")) {
          const { default: pdfParse } = await import("pdf-parse");
          const buffer = Buffer.from(await file.arrayBuffer());
          const parsed = await pdfParse(buffer);
          raw = wrapAsOkf(conceptId, file.name.replace(/\.pdf$/i, ""), parsed.text);
        } else if (file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".markdown")) {
          raw = await file.text();
        } else {
          const text = await file.text();
          raw = wrapAsOkf(conceptId, file.name, text);
        }

        const document = await ingestOkf(tenant.orgId, conceptId, raw);
        return { filename: file.name, ok: true, conceptId, document };
      } catch (err) {
        const message = err instanceof InvalidOKFDocument ? err.message : err instanceof Error ? err.message : "Unknown error";
        return { filename: file.name, ok: false, error: message };
      }
    }),
  );

  return NextResponse.json(results);
}
