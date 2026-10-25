/** Auth headers for /api/plugins/* — Plugin Manager UI must send the session token. */
export function pluginAuthHeaders(json = false): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("astra.serverToken") ?? "" : "";
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}
