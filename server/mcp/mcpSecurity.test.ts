import { gateMcpTool, classifyToolRisk, requireApproval, sanitizeMcpResult } from "./mcpSecurity";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── Role gating ────────────────────────────────────────────────────────────────
const rule = { allowedRoles: ["doctor", "admin"], denyTools: ["destroy", "delete_all"], strictTools: true } as const;

// doctor allowed on an allowed-role server
assert(gateMcpTool(rule, "doctor", "calculate_bmi", {}).allowed, "doctor allowed bmi");
// unknown role rejected
assert(!gateMcpTool(rule, "reception", "calculate_bmi", {}).allowed, "reception denied role");
// deny-listed tool blocked
assert(!gateMcpTool(rule, "doctor", "have_delete_record", {}).allowed, "deny-listed tool blocked");

// ── Risk classification (snake_case normalization) ─────────────────────────────
assert(classifyToolRisk("calculate_bmi", {}) === "LOW", "calculate_bmi is LOW");
assert(classifyToolRisk("read_patient", {}) === "LOW", "read patient is LOW");
assert(classifyToolRisk("delete_record", {}) === "CRITICAL", "delete_record is CRITICAL");
assert(classifyToolRisk("update_chart", {}) === "HIGH", "update chart is HIGH");
assert(classifyToolRisk("create_order", {}) === "MEDIUM", "create order is MEDIUM");
assert(classifyToolRisk("send_message", {}) === "HIGH", "send message is HIGH");

// ── Approval policy (§17) ─────────────────────────────────────────────────────
const deleteDecision = gateMcpTool(rule, "doctor", "delete_record", {});
assert(deleteDecision.requiresApproval === true, "delete requires explicit approval");
assert(deleteDecision.allowed === false, "CRITICAL blocked until approval");
const createDecision = gateMcpTool(rule, "doctor", "create_order", {});
assert(createDecision.requiresApproval === true, "create requires approval");

// ── Sanitizer never leaks secrets ─────────────────────────────────────────────
const scrubbed = sanitizeMcpResult({
  api_key: "sk-secret-123",
  data: { token: "tok", password: "pw", patientName: "Rajesh", lipid: { apiKey: "nested-secret" } },
});
const flat = JSON.stringify(scrubbed);
assert(!/secret/i.test(flat) && !/sk-secret/.test(flat), "top-level api_key removed");
assert(!/nested-secret/.test(flat), "nested apiKey removed");
assert(/Rajesh/.test(flat), "non-secret data preserved");

console.log("MCP security tests OK: role gate, risk classify, approval gate, secret scrub.");