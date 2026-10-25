import ports from "../../config/ports.json";

const entry = ports.services.freellmapi;
export const FREELLMAPI_HOST = entry.host;
export const FREELLMAPI_PORT = entry.port;
export const FREELLMAPI_ORIGIN = `http://${FREELLMAPI_HOST}:${FREELLMAPI_PORT}`;
export const FREELLMAPI_API_URL = `${FREELLMAPI_ORIGIN}/v1`;
