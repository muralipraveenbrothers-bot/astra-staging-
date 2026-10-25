/**
 * Slash commands are aliases. Speech uses the same intents.
 */
import { parseBrowserCommand } from "../part4/browser";
import { findContacts } from "../part4/contacts";
import { currentTrace } from "./trace";
import { differenceMatrix, mem0Status } from "./memory";
import { reviewPatient } from "./review";

export interface CoreCommand {
  name: string;
  reply: string;
}

export function runCoreCommand(text: string): CoreCommand {
  const said = text.trim().toLowerCase();
  if (said.startsWith("/trace") || /trace current/.test(said)) {
    const trace = currentTrace();
    return { name: "/trace current", reply: trace ? trace.request_id : "No request is open." };
  }
  if (said.startsWith("/memory") || /similar case|what changed from this patient/.test(said)) {
    const matrix = differenceMatrix({ age: "unknown" }, { age: "unknown" });
    return { name: "/memory compare", reply: matrix.copiesTreatment ? "copied" : "Difference matrix only. Prior treatment is not copied." };
  }
  if (said.startsWith("/browser")) {
    const parsed = parseBrowserCommand(text);
    return { name: "/browser", reply: parsed?.explanation ?? "Unrecognized browser command." };
  }
  if (said.startsWith("/contact")) {
    const hits = findContacts(text);
    return { name: "/contact find", reply: hits[0]?.name ?? "No matching contact." };
  }
  if (said.startsWith("/brain") || said.startsWith("/evolve")) {
    const mem = mem0Status();
    return { name: said.startsWith("/evolve") ? "/evolve status" : "/brain status", reply: `Hospital systems operational. Mem0 ${mem.state}.` };
  }
  if (/review this patient/.test(said)) {
    const review = reviewPatient(text, { presentation: text });
    return { name: "review-patient", reply: review.kind === "clinical-review" ? review.steps.join("; ") : review.view };
  }
  return { name: "unmapped", reply: "That command is not one of the core aliases." };
}
