import { NextResponse } from "next/server";
import { contentTypeFor, readAvatar, safeFilename } from "@/lib/uploads";

// Reads from object storage or disk per request — never statically prerender.
export const dynamic = "force-dynamic";

/**
 * Serves an uploaded avatar.
 *
 * A route handler rather than Next's static `public/` serving, because
 * `public/` is copied at build time: a file written at runtime works under
 * `next dev` and then 404s in a production build. Reading per request
 * behaves identically in both, and the same path proxies Railway bucket
 * objects when bucket credentials are configured.
 *
 * Public by design — it is the image a worker shows customers, and it is
 * requested by `<img>` tags that carry no auth. The filenames carry 8 random
 * bytes, so they are not guessable from the org id alone.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // The filename comes straight from the URL, so it is validated before it is
  // ever joined onto a path or S3 key — traversal must not reach storage.
  const safe = safeFilename(filename);
  if (!safe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = contentTypeFor(safe);
  if (!contentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = await readAvatar(safe);
  if (!bytes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      // A new upload gets a new filename, so a stored file never changes and
      // can be cached hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
