import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * A connector URL is typed in by a customer admin and then fetched by this
 * server, so it is an SSRF vector: without these checks an admin could point
 * the worker at the deployment's own private network or a cloud metadata
 * endpoint and read the answers back through the tool list.
 *
 * Remote servers only: https, a public hostname, no credentials in the URL.
 * Every request the MCP client makes goes through `assertPublicUrl` again
 * (see client.ts), not just the URL saved here, so a redirect cannot reach
 * what the saved URL could not.
 *
 * Local development can opt out with MCP_CONNECTORS_ALLOW_PRIVATE=true, which
 * permits http and private addresses. Never set it in a deployed environment.
 */

export class ConnectorUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorUrlError";
  }
}

function allowPrivate(): boolean {
  return (process.env.MCP_CONNECTORS_ALLOW_PRIVATE || "").trim().toLowerCase() === "true";
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower.startsWith("fc") ||
    lower.startsWith("fd") || // unique local
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") || // link-local
    lower.startsWith("ff") // multicast
  );
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

/** Shape checks only: no network. Returns the normalized URL. */
export function parseConnectorUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ConnectorUrlError("Enter the server's full URL, starting with https://");
  }
  if (url.protocol !== "https:" && !(allowPrivate() && url.protocol === "http:")) {
    throw new ConnectorUrlError("Connector URLs must use https.");
  }
  if (url.username || url.password) {
    throw new ConnectorUrlError("Put credentials in the authentication fields, not in the URL.");
  }
  url.hash = "";
  return url;
}

/** Resolves the host and refuses anything that lands on a private or reserved address. */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (allowPrivate()) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new ConnectorUrlError("Connectors must be reachable on the public internet.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => null);
  if (!addresses || addresses.length === 0) {
    throw new ConnectorUrlError(`Could not find a server at ${host}.`);
  }
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new ConnectorUrlError("Connectors must be reachable on the public internet.");
  }
}
