export function authHeaders(json = false): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("astra.serverToken") ?? "" : "";
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("astra.serverToken") ?? "" : "";
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
