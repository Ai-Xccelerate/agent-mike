export async function register() {
  const { assertLocalBypassSafe } = await import("@/lib/env");
  assertLocalBypassSafe();
}
