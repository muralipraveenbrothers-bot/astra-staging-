/** Resolve the API bind host without exposing a network interface by default. */
export function resolveBindHost(value = process.env.ASTRA_BIND_HOST): string {
  const host = value?.trim();
  return host || "127.0.0.1";
}
