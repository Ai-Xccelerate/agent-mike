export const CLONED_PROFILE_FIELDS: string[];
export const NEVER_CLONED_PROFILE_FIELDS: string[];
export class ApiError extends Error {
  status: number;
  body: unknown;
}
export type Client = {
  api: string;
  get: (path: string) => Promise<any>;
  post: (path: string, body?: unknown) => Promise<any>;
  patch: (path: string, body?: unknown) => Promise<any>;
};
export function createClient(options: { api: string; token?: string; headers?: Record<string, string>; fetchImpl?: typeof fetch }): Client;
export function knowledgeToOkf(doc: { title: string; description?: string | null; tags?: string[]; resource?: string | null; body: string }): string;
export function exportOrg(client: Client): Promise<any>;
export function backupOrg(client: Client): Promise<any>;
export function readTarget(client: Client): Promise<any>;
export function planImport(bundle: any, target: any): any;
export function describePlan(plan: any): string[];
export function applyPlan(client: Client, bundle: any, plan: any, log?: (line: string) => void): Promise<void>;
export function restoreBackup(client: Client, backup: any): Promise<void>;
export function readKnowledgeDir(dir: string, fs: { readdir: (dir: string) => string[]; readFile: (file: string) => string }): { conceptId: string; raw: string }[];
export function planKnowledge(files: { conceptId: string; raw: string }[], targetKnowledge: any[]): { action: "create" | "update" | "same"; conceptId: string; raw: string }[];
export function applyKnowledge(client: Client, plan: any[], log?: (line: string) => void): Promise<void>;
