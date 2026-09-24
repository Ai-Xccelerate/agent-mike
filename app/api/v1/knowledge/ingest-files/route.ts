import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { ingestOkf, InvalidOKFDocument, readOkfFrontmatter, uploadedKnowledgeRaw } from "@/lib/knowledge";
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
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }

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
      let conceptId = conceptIds[index];
      try {
        let text: string;
        if (file.name.toLowerCase().endsWith(".pdf")) {
          const { default: pdfParse } = await import("pdf-parse");
          const buffer = Buffer.from(await file.arrayBuffer());
          text = (await pdfParse(buffer)).text;
        } else {
          text = await file.text();
        }
        // Frontmatter `id` wins over the filename, as it always has.
        conceptId = readOkfFrontmatter(text)?.id ?? conceptId;
        const { raw } = uploadedKnowledgeRaw(file.name, conceptId, text, { strictMarkdown: true });

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
