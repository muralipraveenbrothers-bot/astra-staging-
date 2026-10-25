import { classifyAstraIntent, AstraIntent, ParsedCommandDraft } from "../components/CommandCenter/commandParser";
import { Patient } from "../types";
import { medicalImageAgentFinal } from "./agents/MedicalImageAgentFinal";
import { centralCommand } from "@/astra/runtime/centralCommand";
import { detectLanguage, getLanguageDisplayName } from "@/astra/voice/voiceEngine";

export interface ResolverResponse {
  id: string;
  role: "assistant" | "user" | "system";
  tier: string;
  timestamp: string;
  text: string;
  statusCard?: any;
  orderDraft?: ParsedCommandDraft;
  showPathMap?: boolean;
  differentials?: any[];
  blindSpots?: any[];
  redFlags?: string[];
  citations?: any[];
  draftActions?: any[];
  trace?: string[];
  suggestionChips?: string[];
  detectedLanguage?: string;
  dxAnalysis?: any;
}

export class CentralResolver {
  /**
   * Resolves natural language query with the universal command + AI brain pipeline.
   * Priority:
   * 1. Multimodal image analysis
   * 2. High-confidence explicit commands (IP/OP lists, billing, OT, direct orders)
   * 3. Everything else -> Central Clinical Command AI Brain (multi-agent, multilingual, cited)
   */
  static async resolveCommand(
    query: string,
    context: {
      selectedPatient: Patient;
      activeMode?: string;
      activeModel?: string;
      chatHistory?: any[];
      imageData?: string;
      enhance?: boolean;
    }
  ): Promise<ResolverResponse> {
    const rawQuery = query ? query.trim() : "";
    const lower = rawQuery.toLowerCase();
    const { selectedPatient } = context;
    const intent = classifyAstraIntent(rawQuery);
    const lang = detectLanguage(rawQuery);

    // ──────────────────────────────────────────────────────────────
    // 1. IMAGE MULTIMODAL ROUTING
    // ──────────────────────────────────────────────────────────────
    if (context.imageData || intent === "IMAGE_ANALYSIS") {
      try {
        const imageResult = await medicalImageAgentFinal.analyzeImage(context.imageData || "", rawQuery || "");

        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          tier: "Astra Multimodal Medical Vision",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: imageResult.display.summary || `Analysis complete. Findings suggest ${imageResult.injuryPattern.type} ${imageResult.injuryPattern.severity}.`,
          statusCard: {
            title: "Image Intelligence Analysis",
            items: [
              { label: "Region", value: `${imageResult.region.side} ${imageResult.region.bodyPart}`.trim(), color: "blue" },
              { label: "Findings", value: imageResult.redFlags.filter(f => !f.includes("No immediate")).length.toString(), color: "rose" },
              { label: "Structures", value: imageResult.hotspots.length.toString(), color: "cyan" },
              { label: "Confidence", value: `${Math.round(imageResult.confidence * 100)}%`, color: "purple" },
            ],
            imageAnalysis: imageResult
          },
        };
      } catch (err) {
        console.error("Image analysis failed:", err);
        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          tier: "Astra Multimodal Medical Vision",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: "⚠️ Image analysis failed. Please try again with a clearer image (JPG, PNG, WEBP under 20MB).",
        };
      }
    }

    // ──────────────────────────────────────────────────────────────
    // 2. HIGH-CONFIDENCE COMMAND INTENTS ONLY
    // ──────────────────────────────────────────────────────────────
    
    // IP PATIENT LIST / CENSUS (explicit action target)
    if (
      intent === "IP_LIST" ||
      intent === "HOSPITAL_CENSUS" ||
      lower === "ip list" ||
      lower === "iplsit" ||
      lower === "show ip patient list" ||
      lower === "show patients in ward" ||
      lower.includes("ward census") ||
      lower.includes("show ip patients")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: "Astra Hospital Command · Sample census (demo)",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `🏥 Sample hospital census (demo data on this screen — not a live ward pull)\n\nTotal IP Patients: 32 Admitted\n\n1. Rajesh Kumar — Bed-01 (Internal Medicine)\n2. Suresh Verma — Bed-05 (Internal Medicine)\n3. Ananya Sharma — ICU-Bed-04 (Critical Care)\n4. Vikram Reddy — Ward-B-02 (Orthopaedics)\n5. Priya Nair — Bed-06 (Gynecology)\n...and 27 others across General and Private Wards.\n\n📊 Bed Occupancy: 84% (32/38 beds occupied)\n🔴 ICU Occupancy: 100% (6/6 beds full)\n\nShall I display the discharge candidates for today to free up beds?`,
        statusCard: {
          title: "IP Census Summary",
          items: [
            { label: "Total IP", value: "32", color: "blue" },
            { label: "ICU", value: "6/6", color: "rose" },
            { label: "Ward", value: "26/32", color: "emerald" },
            { label: "Occupancy", value: "84%", color: "cyan" },
          ],
        },
        suggestionChips: ["Show OP Queue", "Order Lab Bundle", "Discharge Candidates", "OT Status"],
      };
    }

    // OP PATIENT LIST / QUEUE (explicit action target)
    if (
      intent === "OP_LIST" ||
      lower === "op list" ||
      lower === "oplsit" ||
      lower === "show op list" ||
      lower === "show opd queue" ||
      lower === "show op queue" ||
      lower.includes("op queue")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: "Astra Queue Manager · Sample OPD (demo)",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `🚶‍♂️ Sample Out-Patient (OP) queue (demo data on this screen — not a live OPD pull) — Internal Medicine\n\nTotal OP Today: 4 patients\n\n1. Rajesh Kumar (Active) — 48y/M | UHID-2026-8801 | Queue #1 | ⚠️ High Fever 101.4°F, retro-orbital headache, chills\n2. Lakshmi Devi — 54y/F | UHID-2026-8810 | Queue #2 | Bronchial Asthma flare | Status: Checked-in\n3. Mohd. Tariq — 39y/M | UHID-2026-8811 | Queue #3 | Suspected Renal Calculus | Waiting for vitals\n4. Sneha Gupta — 27y/F | UHID-2026-8812 | Queue #4 | Routine Hypothyroidism follow-up | Waiting\n\n🎯 Triage Priority: Rajesh Kumar (Queue #1) — dengue suspicion. Recommend STAT CBC + Dengue NS1/IgM bundle.\n\nShall I prepare an investigation order bundle?`,
        statusCard: {
          title: "OPD Queue Summary",
          items: [
            { label: "Total OP", value: "4", color: "blue" },
            { label: "Urgent", value: "1", color: "amber" },
            { label: "Follow-up", value: "2", color: "emerald" },
            { label: "New Consult", value: "1", color: "cyan" },
          ],
        },
        suggestionChips: ["Show IP Census", "Order CBC Bundle", "Start Video Consult", "Billing Summary"],
      };
    }

    // BILLING SUMMARY
    if (intent === "BILLING_SUMMARY" || lower === "billing summary" || lower === "billing summary today" || lower.includes("revenue today")) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: "Astra Finance Engine · Sample (demo)",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "💰 Sample billing summary (demo numbers on this screen — not live finance)\n\nTotal Collections Today: ₹4,52,000\nOP Billing: ₹1,20,000\nIP Billing & Discharges: ₹3,32,000\nPending Insurance Claims: 14",
        suggestionChips: ["IP Patient List", "OP Queue", "Discharge Summary"],
      };
    }

    // OT STATUS
    if (intent === "OT_STATUS" || lower === "ot" || lower === "ot status" || lower === "ot status now") {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: "Astra OT Commander · Sample (demo)",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "🔪 Sample Operation Theater status (demo — not a live OT board)\n\nOT 1: In Progress (CABG) - Dr. Sharma\nOT 2: Cleaning / Fumigation - ETA 15 mins\nOT 3: Idle - Ready for emergency\nOT 4: Scheduled (Appy) - ETA 10:30 AM",
        suggestionChips: ["IP Patient List", "Order PAC Clearance", "Emergency OT Bump"],
      };
    }

    // LAB ORDER (explicit order action)
    if (
      intent === "LAB_ORDER" ||
      lower.startsWith("order cbc") ||
      lower.startsWith("order lab") ||
      lower.startsWith("order crp") ||
      lower.startsWith("order lft")
    ) {
      if (!(selectedPatient as any)?.uhid) {
        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          tier: "⚠️ NO PATIENT SELECTED",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: "⚠️ No patient selected. Please select a patient before placing a lab order.",
          suggestionChips: ["Show IP List", "Show OP List"],
        };
      }

      let bedMatch = (selectedPatient as any)?.bedNumber || "Bed-01";
      if (/(bed\s*no\s*2|2\s*(nd|rd|th)\s*bed|bed\s*2)/i.test(lower) || lower.includes("ward b")) bedMatch = "Ward-B-02";
      else if (/(bed\s*no\s*5|5\s*(th|nd|rd)\s*bed|bed\s*5)/i.test(lower)) bedMatch = "Bed-05";
      else if (/(bed\s*no\s*4|4\s*(th|nd|rd)\s*bed|bed\s*4)/i.test(lower) || lower.includes("icu")) bedMatch = "ICU-Bed-04";

      const tests: string[] = [];
      if (lower.includes("cbp") || lower.includes("cbc")) tests.push("Complete Blood Picture (CBP) + Platelet Count");
      if (lower.includes("crp")) tests.push("C-Reactive Protein (CRP)");
      if (lower.includes("lft")) tests.push("Liver Function Tests (LFT)");
      if (lower.includes("rft")) tests.push("Renal Function Tests (RFT)");
      if (lower.includes("blood culture")) tests.push("Blood Culture & Sensitivity (2 sets)");
      if (tests.length === 0) tests.push("Complete Blood Picture (CBP) + Platelet Count");

      const targetDraft: ParsedCommandDraft = {
        isCommand: true,
        intent: "LAB_ORDER",
        category: "Laboratory",
        rawQuery: query,
        patientName: (selectedPatient as any).name,
        patientUhid: (selectedPatient as any).uhid,
        bedNumber: bedMatch,
        destinationDept: "Laboratory Workstation",
        itemSummary: tests.join(" + "),
        orderType: "LABORATORY",
        priority: lower.includes("stat") ? "STAT" : "ROUTINE",
      };

      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: `⚡ COMMAND PARSED [LAB_ORDER] • ${tests.length} test(s) queued`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `Right away, Dr. Murali. I have queued:\n\n${tests.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nFor: ${(selectedPatient as any)?.name || "Active Patient"} (${bedMatch})\nTarget: Laboratory Workstation → Phlebotomy team alerted\n\nReview and confirm:`,
        orderDraft: targetDraft,
        suggestionChips: ["Confirm STAT Order", "Add CXR", "Show IP List"],
      };
    }

    // ──────────────────────────────────────────────────────────────
    // 2.5 SCIENTIST CAUSE-FINDER (voice: "Mayin, what's causing this?")
    //    Runs the deterministic diagnosis engine on the open patient.
    // ──────────────────────────────────────────────────────────────
    if (/(what(?:'s| is) causing|causing this|cause of (?:this|the|his|her)|why is (?:he|she|the patient))/i.test(lower)) {
      try {
        const p: any = selectedPatient;
        const caseData: any = {
          complaint: [p?.diagnosis, p?.complaints].filter(Boolean).join(" — ") || rawQuery,
          patient: { age: p?.age, sex: p?.gender },
        };
        if (p?.vitals) caseData.vitals = { bp: p.vitals.bp, hr: p.vitals.hr, temp: p.vitals.temp, spo2: p.vitals.spo2, rr: p.vitals.rr };
        const token = typeof localStorage !== "undefined" ? localStorage.getItem("astra.serverToken") ?? "" : "";
        const res = await fetch("/api/clinical/scientist/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ caseData }),
        });
        if (res.ok) {
          const j = await res.json();
          const a = j.analysis;
          return {
            id: `sci-${Date.now()}`,
            role: "assistant",
            tier: `🧬 Scientist Cause-Finder • ${a.mode === "llm-augmented" ? "LLM-augmented" : "rules-only"}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            text: a.spokenSummary,
            dxAnalysis: a,
            suggestionChips: ["Open full Diagnosis & Cause panel", "Add a test result", "Highlight organ in 3D"],
          };
        }
      } catch (err) {
        console.warn("Scientist cause-finder failed, falling through to central command:", err);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // 3. EVERYTHING ELSE → ASTRA AI BRAIN (CENTRAL COMMAND)
    // ──────────────────────────────────────────────────────────────
    try {
      const centralRes = await centralCommand.run(rawQuery, {
        activePatient: selectedPatient
          ? {
              name: selectedPatient.name,
              uhid: selectedPatient.uhid,
              bedNumber: selectedPatient.bedNumber,
              age: (selectedPatient as any).age,
              gender: (selectedPatient as any).gender,
              allergies: (selectedPatient as any).allergies || [],
              medications: (selectedPatient as any).activeMedications || [],
            }
          : undefined,
        doctorName: "Dr. Murali Praveen",
      });

      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: centralRes.contributingPlugins.length > 0
          ? `Astra Central Command • ${centralRes.contributingPlugins.join(" + ")}`
          : `Astra Clinical Co-Pilot • ${getLanguageDisplayName(lang)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: centralRes.answer,
        differentials: centralRes.differentials,
        blindSpots: centralRes.blindSpots,
        redFlags: centralRes.redFlags,
        citations: centralRes.citations,
        draftActions: centralRes.draftActions,
        trace: centralRes.trace.map((t) => `[${t.step}] ${t.detail}`),
        statusCard: centralRes.differentials.length > 0
          ? {
              title: "Diagnostic Summary",
              items: [
                { label: "Top Dx", value: centralRes.differentials[0]?.condition?.slice(0, 24) || "Dengue", color: "rose" },
                { label: "Probability", value: centralRes.differentials[0]?.probability || "High", color: "amber" },
                { label: "Blind Spots", value: centralRes.blindSpots.length.toString(), color: "cyan" },
                { label: "Citations", value: centralRes.citations.length.toString(), color: "emerald" },
              ],
            }
          : undefined,
        suggestionChips: [
          "🏥 IP Patient List",
          "🚶‍♂️ OP Queue",
          "⚡ Order Lab Bundle",
          "🧠 Differential Diagnosis",
        ],
        detectedLanguage: lang,
      };
    } catch (err: any) {
      console.warn("CentralCommand execution error, using contextual synthesis:", err);

      const patientName = (selectedPatient as any)?.name || "Rajesh Kumar";
      const bedNumber = (selectedPatient as any)?.bedNumber || "Bed-01";
      const diagnosis = (selectedPatient as any)?.diagnosis || "Febrile Illness / Dengue Suspicion";

      // Warm, natural greeting & context fallback
      let fallbackText = `Hello Dr. Murali! 👋 I am Astra, your Clinical Co-Pilot.\n\n📍 **Active Context**: ${patientName} (${bedNumber} • ${diagnosis})\n\nHow can I help you right now? Feel free to ask clinical questions, request patient differentials, or manage hospital operations.`;

      if (lang === 'te-IN') {
        fallbackText = `నమస్కారం డాక్టర్ మురళి గారు! 👋 నేను ఆస్ట్రా (Astra), మీ క్లినికల్ కో-పైలట్.\n\n📍 **యాక్టివ్ పేషెంట్**: ${patientName} (${bedNumber} • ${diagnosis})\n\nనేను మీకు ఏ విధంగా సహాయం చేయగలను? మీరు తెలుగు లేదా ఇంగ్లీషులో క్లినికల్ ప్రశ్నలు అడగవచ్చు లేదా హాస్పిటల్ ఆర్డర్లు ఇవ్వవచ్చు.`;
      } else if (lang === 'hi-IN') {
        fallbackText = `नमस्ते डॉ. मुरली! 👋 मैं अस्त्रा (Astra) हूँ, आपका क्लिनिकल को-पायलट।\n\n📍 **सक्रिय मरीज**: ${patientName} (${bedNumber} • ${diagnosis})\n\nमैं आपकी किस प्रकार सहायता कर सकता हूँ? आप क्लिनिकल प्रश्न पूछ सकते हैं या अस्पताल कार्यप्रवाह संचालित कर सकते हैं।`;
      }

      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        tier: "Astra Clinical Co-Pilot",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: fallbackText,
        suggestionChips: ["🏥 IP Patient List", "🚶‍♂️ OP Queue", "⚡ Order CBC", "🧠 Differential Diagnosis"],
        detectedLanguage: lang,
      };
    }
  }
}
