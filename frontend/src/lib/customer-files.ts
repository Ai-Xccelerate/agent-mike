import { apiBlob } from "@/lib/worker-api";

/** Files a visitor attaches in the website chat. Mirrors lib/attachments.ts on the API, which enforces the same limits. */
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.csv,.xlsx,.docx";
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILES_MAX = 5;

export type CustomerFile = { id: string; filename: string; contentType: string; sizeBytes: number };

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The line added to a message that carries files, the same words the API stores. */
export function attachedLines(files: { filename: string; size: number }[]): string {
  return files.map((file) => `[Attached: ${file.filename} (${fileSize(file.size)})]`).join("\n");
}

/** A signed-in manager's download: fetched with their token, since a plain link would not carry it. */
export async function downloadCustomerFile(file: Pick<CustomerFile, "id" | "filename">): Promise<void> {
  const blob = await apiBlob(`/attachments/${encodeURIComponent(file.id)}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
