import { routeIntent } from "./taskRouter";
import { AITask } from "./types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(routeIntent("fever with falling platelets, differential?") === AITask.DiagnosisSupport, "ddx");
assert(routeIntent("pubmed rct for dengue warning signs") === AITask.EvidenceSearch, "evidence");
assert(routeIntent("translate this into Telugu") === AITask.MultilingualTranslation, "translate");
assert(routeIntent("drug interaction amlodipine and simvastatin") === AITask.MedicationReview, "drug");
assert(routeIntent("what does this chest x-ray show") === AITask.Vision, "vision");
assert(routeIntent("hospital census and pending lab orders", "census") === AITask.HospitalOperations, "census hint");
assert(routeIntent("hospital census") === AITask.HospitalOperations, "census in query");
assert(routeIntent("hello") === AITask.GeneralAssistant, "general");
console.log("taskRouter intent mapping OK");
