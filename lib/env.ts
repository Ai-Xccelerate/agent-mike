export const DEFAULT_ORG_ID = "default";
export const DEFAULT_ORG_NAME = "Default Workspace";

export function envList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE || "").toLowerCase() === "true";
}
