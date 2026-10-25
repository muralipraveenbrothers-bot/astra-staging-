import { createRequire } from "module";
const require = createRequire("D:/astra PM/freellmapi/server/package.json");
const Database = require("better-sqlite3");

const db = new Database("D:/astra PM/freellmapi/server/data/freeapi.db", { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("TABLES", tables.map((t) => t.name).join(","));

try {
  const users = db.prepare("SELECT * FROM users").all();
  console.log("USER_COUNT", users.length);
  for (const u of users) {
    const safe = {};
    for (const k of Object.keys(u)) {
      safe[k] = /pass|hash|secret|token/i.test(k) ? "[redacted]" : u[k];
    }
    console.log("USER", JSON.stringify(safe));
  }
} catch (e) {
  console.log("users err", e.message);
}

try {
  const row = db
    .prepare("SELECT key, length(value) as len, substr(value,1,12) as prefix FROM settings WHERE key='unified_api_key'")
    .get();
  console.log("UNIFIED", JSON.stringify(row));
} catch (e) {
  console.log("unified err", e.message);
}

db.close();
