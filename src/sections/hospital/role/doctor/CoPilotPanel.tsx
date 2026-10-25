import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Bot, CheckCircle2, FileText, Mic, Microscope, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { ClinicalFormattedMessage } from "@/components/Doctor/ClinicalFormattedMessage";
import { ChatImageUploader, type UploadedFile } from "@/components/Doctor/ChatImageUploader";
import { AdvancedImageAnnotationViewer } from "@/components/Doctor/AdvancedImageAnnotationViewer";
import { VoiceInteractionOverlay } from "@/components/Doctor/VoiceInteractionOverlay";
import { voiceEngine } from "@/astra/voice/voiceEngine";
import { voiceSession } from "@/astra/voice/safety/voiceSession";
import { useVoicePrefs } from "@/astra/voice/useVoicePrefs";
import { useGesturePrefs } from "@/features/mayin/gesture/useGesturePrefs";
import { DiagnosisCausePanel } from "@/sections/hospital/clinical/DiagnosisCausePanel";
import { HudGlassPanel } from "./hudBits";
import type { ChatMessage, Patient } from "./types";

export type EngineId = "Decision Engine" | "Hermes Agent" | "OCR & Vision";
export type ModelId = "gemini-3.1-pro-preview" | "gemini-3.1-flash-lite";

interface Props {
  selectedPatient: Patient;
  isDarkTheme: boolean;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  loadingAi: boolean;
  orderBox: string;
  setOrderBox: React.Dispatch<React.SetStateAction<string>>;
  chatScrollRef: React.RefObject<HTMLDivElement>;

  activeEngine: EngineId;
  setActiveEngine: (e: EngineId) => void;
  activeMode: string;
  setActiveMode: (m: string) => void;
  activeModel: ModelId;
  setActiveModel: (m: ModelId) => void;
  thinkingHigh: boolean;
  setThinkingHigh: (v: boolean) => void;

  voiceToVoiceActive: boolean;
  setVoiceToVoiceActive: (v: boolean) => void;
  voiceReplyOn: boolean;
  setVoiceReplyOn: (v: boolean) => void;
  isSpeaking: boolean;
  setIsSpeaking: (v: boolean) => void;
  voiceOpen: boolean;
  setVoiceOpen: (v: boolean) => void;
  voiceTarget: "chat" | "order";
  setVoiceTarget: (v: "chat" | "order") => void;

  videoCallActive: boolean;
  setVideoCallActive: (v: boolean) => void;
  videoCallTarget: string;
  setVideoCallTarget: (v: string) => void;

  astraModesList: string[];
  suggestedInquiriesByMode: Record<string, string[]>;

  searchHost?: HTMLElement | null;
  historyOpen?: boolean;
  chatVisible?: boolean;
  thinkingEffect?: "light" | "medium" | "high";
  setThinkingEffect?: (level: "light" | "medium" | "high") => void;
  openAnalysisSignal?: number;
  attachRequest?: number;

  handleSendMessage: (text?: string, file?: UploadedFile) => void | Promise<void>;
  handleConfirmDraftOrder: (order: any) => void;
}

export function CoPilotPanel(p: Props) {
  const {
    selectedPatient, isDarkTheme, chatMessages, loadingAi, orderBox, setOrderBox, chatScrollRef,
    activeEngine, setActiveEngine, activeMode, setActiveMode, activeModel, setActiveModel,
    thinkingHigh, setThinkingHigh, voiceToVoiceActive, setVoiceToVoiceActive, voiceReplyOn, setVoiceReplyOn,
    isSpeaking, setIsSpeaking, voiceOpen, setVoiceOpen, voiceTarget, setVoiceTarget,
    videoCallActive, setVideoCallActive, videoCallTarget, setVideoCallTarget,
    astraModesList, suggestedInquiriesByMode, handleSendMessage, handleConfirmDraftOrder,
    searchHost = null, historyOpen = true, chatVisible = true, thinkingEffect = "medium", setThinkingEffect, openAnalysisSignal = 0, attachRequest = 0,
  } = p;

  const endVideoCall = () => { setVideoCallActive(false); setVideoCallTarget(""); toast.info("Video call ended."); };
  const [dxOpen, setDxOpen] = useState(false);
  const [chatToolsOpen, setChatToolsOpen] = useState(false);
  const [attachSignal, setAttachSignal] = useState(0);
  const [deepOpen, setDeepOpen] = useState(false);
  const [dimOpen, setDimOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const { wakeWordEnabled, setWakeWordEnabled } = useVoicePrefs();
  const { gestureEnabled, setGestureEnabled } = useGesturePrefs();
  const openAttach = () => { setChatToolsOpen(true); setAttachSignal((n) => n + 1); };
  const openStaff = () => { window.dispatchEvent(new CustomEvent("astra-staff-connect-open", { detail: { video: false } })); };
  const soloHello = chatMessages.length === 1 && chatMessages[0]?.id === "msg-1";
  useEffect(() => { if (openAnalysisSignal) setDxOpen(true); }, [openAnalysisSignal]);
  useEffect(() => {
    if (!attachRequest) return;
    setChatToolsOpen(true);
    setAttachSignal((n) => n + 1);
  }, [attachRequest]);

  const composer = (
    <div className="dh-chatbox">
      <div className="dh-plus-wrap">
        <button type="button" className="dh-corner" aria-expanded={plusMenuOpen} aria-label="More command actions" onClick={() => setPlusMenuOpen((v) => !v)}>+</button>
        {plusMenuOpen && (
          <div className="dh-plus-menu" role="menu">
            <button type="button" onClick={() => { setPlusMenuOpen(false); openAttach(); }}>Upload document / Attach file</button>
            <button type="button" onClick={() => { setPlusMenuOpen(false); voiceSession.requestStart(); }}>Start voice</button>
            <button type="button" onClick={() => { setPlusMenuOpen(false); openStaff(); }}>Staff Connect — not a live call</button>
            <button type="button" onClick={() => { setWakeWordEnabled(!wakeWordEnabled); }}>Wake word {wakeWordEnabled ? "ON" : "OFF"}</button>
            <button type="button" onClick={() => { setGestureEnabled(!gestureEnabled); }}>Hand control {gestureEnabled ? "ON" : "OFF"}</button>
            <button type="button" onClick={() => { setPlusMenuOpen(false); setOrderBox((prev) => (prev.trim() ? prev : "Quick order draft: ")); }}>Quick order — fills the box, does not send</button>
          </div>
        )}
      </div>
      <div className="dh-composer-box">
        <ChatImageUploader
          value={orderBox}
          onValueChange={setOrderBox}
          onSend={(text, file) => { setOrderBox(""); void handleSendMessage(text, file); }}
          isLoading={loadingAi}
          variant="dark"
          placeholder="Ask Astra…"
          openMenuSignal={attachSignal}
          hideBuiltinPlus
          trailing={
            <>
              <button type="button" className="dh-corner" aria-label="Attach image, PDF, or document" onClick={openAttach}>Attach</button>
              <button type="button" className="dh-corner" aria-label="Voice input, speech to text" onClick={() => { setVoiceTarget("chat"); setVoiceOpen(true); }}><Mic className="w-4 h-4" /></button>
            </>
          }
        />
        <VoiceInteractionOverlay
          open={voiceOpen}
          localOnly={voiceTarget === "order"}
          onClose={() => { setVoiceOpen(false); setVoiceToVoiceActive(false); }}
          onTranscript={(text) => {
            setVoiceOpen(false);
            if (voiceTarget === "order") {
              setOrderBox((prev) => (prev.trim() ? prev.trim() + " " + text.trim() : text.trim()));
              return;
            }
            void handleSendMessage(text);
          }}
          patientName={selectedPatient?.name}
          isDarkTheme={isDarkTheme}
        />
      </div>
    </div>
  );
return (
    <div className={"dh-copilot-wrap dh-think-" + thinkingEffect + (chatVisible ? "" : " is-hidden")}>
    <HudGlassPanel
      accent={"#3730a3"}
      delay={120}
      lift={false}
      className="p-4 flex flex-col justify-between min-h-[750px]"
      ariaLabel="Astra Clinical Co-Pilot"
    >
      <div className="space-y-3 flex-1 flex flex-col min-h-0">
        {/* Chat Stream / Diagnosis & Cause */}
        {dxOpen ? (
          <div className="flex-1 overflow-y-auto pr-1 dh-thread">
            <DiagnosisCausePanel patient={selectedPatient} onConfirmDraftOrder={handleConfirmDraftOrder} />
          </div>
        ) : !historyOpen ? (
          <p className="dh-note">Chat history is collapsed. Show More opens it again. Nothing was deleted.</p>
        ) : (
        <div ref={chatScrollRef} className="space-y-3 flex-1 overflow-y-auto pr-1 dh-thread">
          {soloHello ? <article className="dh-hello"><p>Hello Doctor, I am Astra AI — your Universal Doctor Command Center.</p></article> : chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-2xl p-3.5 text-xs space-y-2 border transition-all ${
                msg.role === "user"
                  ? "border-sky-400/30 ml-8 text-white"
                  : "border-white/10 text-white/90"
              }`}
              style={{ background: msg.role === "user" ? "rgba(124,200,255,0.10)" : "rgba(255,255,255,0.04)" }}
            >
              {msg.role === "assistant" ? (
                <ClinicalFormattedMessage content={msg.text} isAi={true} />
              ) : (
                <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
              )}

              {msg.attachedImage && msg.role === "user" && (
                <img src={msg.attachedImage} alt="Uploaded attachment" className="w-28 h-28 object-cover rounded-lg border border-white/20" />
              )}
              {msg.pdfUrl && msg.role === "user" && (
                <div className="flex items-center gap-2 rounded-lg p-2.5 border border-white/15 bg-white/5">
                  <FileText className="w-4 h-4 shrink-0" style={{ color: "#b91c1c" }} />
                  <span className="text-[11px]">📄 PDF / Document attached</span>
                </div>
              )}

              {msg.imageAnalysis && (
                <div className="rounded-xl border p-3 space-y-2.5 mt-1 text-[11px] bg-[#060b18] border-sky-500/30 text-slate-100">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[10px]" style={{ color: "#1d4ed8" }}>
                      <Activity className="w-3.5 h-3.5" /> Multimodal Image Intelligence
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      (msg.imageAnalysis.confidence ?? 0) >= 0.7
                        ? "bg-emerald-900/30 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-900/30 text-amber-300 border-amber-500/30"
                    }`}>
                      Confidence: {Math.round((msg.imageAnalysis.confidence ?? 0) * 100)}%
                    </span>
                  </div>

                  {msg.attachedImage && (
                    <img src={msg.attachedImage} alt="Analyzed" className="max-h-40 rounded-lg border border-white/15 object-cover" />
                  )}

                  {msg.imageAnalysis.region && (
                    <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#1d4ed8" }}>Region & Orientation</span>
                      <p className="text-slate-200 mt-0.5">
                        {msg.imageAnalysis.region.side} {msg.imageAnalysis.region.bodyPart} — {msg.imageAnalysis.region.specificArea}
                      </p>
                    </div>
                  )}

                  {msg.imageAnalysis.display?.labels && msg.imageAnalysis.display.labels.length > 0 && (
                    <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#0f766e" }}>Anatomical Labels</span>
                      <div className="space-y-1 mt-1">
                        {msg.imageAnalysis.display.labels.map((label: any, i: number) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                              label.type === "nerve" ? "bg-yellow-400" :
                              label.type === "artery" ? "bg-red-400" :
                              label.type === "vein" ? "bg-blue-400" :
                              label.type === "bone" ? "bg-slate-300" :
                              label.type === "tendon" ? "bg-purple-400" : "bg-slate-600"
                            }`} />
                            <span className="text-white font-medium">{label.name}</span>
                            <span className="text-slate-400">— {label.condition}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.imageAnalysis.display?.priority && msg.imageAnalysis.display.priority.length > 0 && (
                    <div className="bg-blue-900/20 rounded-lg p-2 border border-blue-700/30">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#1d4ed8" }}>Priority Action Plan</span>
                      <div className="space-y-1 mt-1">
                        {msg.imageAnalysis.display.priority.map((action: any, i: number) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
                              action.urgency === "immediate" ? "bg-red-600 text-white" :
                              action.urgency === "urgent" ? "bg-amber-600 text-white" :
                              action.urgency === "evaluate" ? "bg-blue-600 text-white" : "bg-slate-600 text-slate-300"
                            }`}>
                              {action.urgency.toUpperCase()}
                            </span>
                            <span className="text-slate-200">{action.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.imageAnalysis.redFlags && msg.imageAnalysis.redFlags.length > 0 && (
                    <div className="bg-rose-950/20 border border-rose-900/30 rounded-lg p-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#b91c1c" }}>Red Flags</span>
                      <ul className="text-rose-200/90 list-disc list-inside mt-0.5 space-y-0.5">
                        {msg.imageAnalysis.redFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}

                  {msg.imageAnalysis.emrSnippet && (
                    <div className="bg-black/40 rounded-lg p-2 border border-white/10">
                      <span className="text-[9px] text-white/50 uppercase font-bold">EMR Documentation</span>
                      <p className="text-white/70 italic mt-0.5">{msg.imageAnalysis.emrSnippet}</p>
                      <button type="button" onClick={() => navigator.clipboard.writeText(msg.imageAnalysis.emrSnippet)} className="mt-1 text-[10px] hover:opacity-80" style={{ color: "#1d4ed8" }} aria-label="Copy EMR snippet to clipboard">
                        📋 Copy to clipboard
                      </button>
                    </div>
                  )}
                </div>
              )}

              {msg.imageAnalysis?.hotspots && msg.imageAnalysis.hotspots.length > 0 && msg.attachedImage && (
                <div className="mt-2">
                  <AdvancedImageAnnotationViewer
                    imageUrl={msg.attachedImage}
                    hotspots={msg.imageAnalysis.hotspots}
                    regionName={`${msg.imageAnalysis.region.side} ${msg.imageAnalysis.region.bodyPart}`.trim()}
                    injuryType={msg.imageAnalysis.injuryPattern.type}
                    injurySeverity={msg.imageAnalysis.injuryPattern.severity}
                    analysisSummary={msg.imageAnalysis.display.summary}
                    onExport={(blob) => { console.log("Exported annotated analysis PNG:", blob.size, "bytes"); }}
                  />
                </div>
              )}

              {msg.showPathMap && (
                <div className="p-3 rounded-xl border border-white/10 bg-black/30 mt-2 space-y-1.5 text-[11px] font-mono text-white/80">
                  <div className="font-bold uppercase text-[10px]" style={{ color: "#1d4ed8" }}>
                    CELL → ORGAN PATHOPHYSIOLOGY MAP (Dengue / Febrile Trajectory)
                  </div>
                  <div>• <strong className="text-white/50">MOLECULAR:</strong> Viral NS1 glycoprotein binding to endothelial surface heparin sulfate</div>
                  <div>• <strong className="text-white/50">CELLULAR:</strong> Endothelial cell activation & capillary leak syndrome</div>
                  <div>• <strong className="text-white/50">TISSUE:</strong> Subvascular plasma extravasation & microvascular fragility</div>
                  <div>• <strong className="text-white/50">ORGAN:</strong> Hepatic transaminitis & splenic sequestration of platelets</div>
                  <div>• <strong className="text-white/50">SYSTEMIC:</strong> Thrombocytopenia, hemoconcentration & febrile response</div>
                  <div>• <strong style={{ color: "#b91c1c" }} className="font-bold">PRESENTATION:</strong> High fever, retro-orbital headache, chills, platelet drop (&lt;100k/uL)</div>
                </div>
              )}

              {msg.orderDraft && (
                <div className="p-3.5 rounded-xl border mt-2 space-y-2.5 bg-black/25" style={{ borderColor: "color-mix(in srgb, #7CC8FF 45%, transparent)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border" style={{ color: "#1d4ed8", background: "rgba(124,200,255,0.16)", borderColor: "color-mix(in srgb, #7CC8FF 40%, transparent)" }}>
                      ORDER DRAFT FOR ROUTING ({msg.orderDraft.priority})
                    </span>
                    <span className="text-[10px] text-white/45">{msg.orderDraft.bed}</span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div><strong className="text-white/50">Patient:</strong> {msg.orderDraft.patientName} ({msg.orderDraft.patientUhid})</div>
                    <div><strong className="text-white/50">Target Dept:</strong> <span className="font-bold" style={{ color: "#1d4ed8" }}>{msg.orderDraft.targetDept}</span></div>
                    <div><strong className="text-white/50">Order Items:</strong> {msg.orderDraft.itemSummary}</div>
                  </div>

                  {msg.orderDraft.items && (
                    <div className="space-y-1 pt-1 border-t border-white/10">
                      {msg.orderDraft.items.map((item: string, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs font-semibold">
                          <span>{i + 1}. {item}</span>
                          <span className="text-[10px]" style={{ color: "#0f766e" }}>Requisition Ready</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleConfirmDraftOrder(msg.orderDraft)}
                    className="w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 text-white"
                    style={{ background: "var(--hud-grad-iris-sky)", boxShadow: "0 0 20px -6px " + "#1d4ed8" }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {msg.orderDraft.items ? `CONFIRM & ROUTE ALL ${msg.orderDraft.items.length} ORDERS` : "CONFIRM & ROUTE ORDER"}
                  </button>
                </div>
              )}

              {msg.orderConfirmed && (
                <div className="p-2.5 rounded-xl border text-xs space-y-1 mt-1" style={{ borderColor: "color-mix(in srgb, #5EF2C2 45%, transparent)", background: "rgba(94,242,194,0.10)", color: "#0f766e" }}>
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> DISPATCHED: {msg.orderConfirmed.orderId}
                  </div>
                  <div className="text-[10px] opacity-90">
                    Target: {msg.orderConfirmed.targetDept} • Closed-loop tracking active (20% Dispatched)
                  </div>
                </div>
              )}

              {msg.dxAnalysis && (
                <div className="p-3 rounded-xl border mt-2 space-y-2 bg-black/25" style={{ borderColor: "color-mix(in srgb, #6C63FF 45%, transparent)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border" style={{ color: "#3730a3", background: "rgba(108,99,255,0.16)", borderColor: "color-mix(in srgb, #6C63FF 40%, transparent)" }}>
                      <Microscope className="w-3 h-3 inline mr-1" />Scientist Diagnosis & Cause {msg.dxAnalysis.mode === "llm-augmented" ? "· LLM" : "· rules-only"}
                    </span>
                    <span className="text-[10px] text-white/45">rev {msg.dxAnalysis.revision}</span>
                  </div>
                  {(msg.dxAnalysis.hypotheses ?? []).slice(0, 4).map((h: any, i: number) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-white">{h.diagnosis}</span>
                        <span className={`px-1.5 py-px rounded text-[8px] font-bold ${h.tier === "cant-miss" ? "bg-rose-900/40 text-rose-300" : h.tier === "expanded" ? "bg-amber-900/40 text-amber-300" : "bg-emerald-900/40 text-emerald-300"}`}>{h.tier === "cant-miss" ? "CAN'T-MISS" : h.tier === "expanded" ? "EXPANDED" : "MOST LIKELY"}</span>
                        <span className="ml-auto font-mono text-[10px]" style={{ color: h.tier === "cant-miss" ? "#b91c1c" : "#0f766e" }}>{Math.round(h.probability * 100)}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.probability * 100)}%`, background: h.tier === "cant-miss" ? "#b91c1c" : h.tier === "expanded" ? "#b45309" : "#0f766e" }} />
                      </div>
                    </div>
                  ))}
                  {msg.dxAnalysis.redFlags?.length > 0 && (
                    <div className="text-[10px]" style={{ color: "#b91c1c" }}>⚠ {msg.dxAnalysis.redFlags[0]}{msg.dxAnalysis.redFlags.length > 1 ? ` (+${msg.dxAnalysis.redFlags.length - 1} more)` : ""}</div>
                  )}
                  <p className="text-[11px] text-white/75 leading-relaxed">{msg.dxAnalysis.spokenSummary}</p>
                  <button
                    type="button"
                    onClick={() => { setDxOpen(true); }}
                    className="w-full py-1.5 rounded-lg font-bold text-[10px] transition-all active:scale-95 text-white"
                    style={{ background: "rgba(108,99,255,0.30)", border: "1px solid rgba(108,99,255,0.5)" }}
                  >
                    OPEN FULL DIAGNOSIS & CAUSE PANEL
                  </button>
                </div>
              )}

              {msg.videoCall && (
                <div className="p-4 rounded-xl border mt-2 space-y-3 bg-black/25" style={{ borderColor: "color-mix(in srgb, #5EF2C2 45%, transparent)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#0f766e" }}>
                        No live video • {msg.videoCall.bed}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(94,242,194,0.18)", color: "#0f766e" }}>{msg.videoCall.ward}</span>
                  </div>

                  <div className="rounded-lg h-36 flex items-center justify-center border border-white/10 bg-black/50">
                    <div className="text-center space-y-2">
                      <div className="text-3xl">📹</div>
                      <div className="text-white text-xs font-semibold">No camera feed — {msg.videoCall.staffName}</div>
                      <div className="text-[10px] animate-pulse" style={{ color: "#0f766e" }}>● Not connected. No camera feed.</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={endVideoCall} aria-label="End call" className="flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 text-white" style={{ background: "color-mix(in srgb, #FF7A6B 70%, transparent)" }}>
                      <X className="w-4 h-4" /> END CALL
                    </button>
                    <button type="button" onClick={() => { setVoiceTarget("order"); setVoiceOpen(true); }} aria-label="Speak an order" className="flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 text-white" style={{ background: "var(--hud-grad-iris-sky)" }}>
                      <Mic className="w-4 h-4" /> SPEAK ORDER
                    </button>
                  </div>
                </div>
              )}

              {msg.statusCard && (
                <div className="grid grid-cols-4 gap-2 mt-2 p-2 rounded-xl border border-white/10 bg-white/[0.03]">
                  {msg.statusCard.items.map((item, i) => (
                    <div key={i} className="text-center px-2 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-white/50">{item.label}</div>
                      <div className="text-sm font-black text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

                    {loadingAi && (
            <div className="dh-think-mark p-3.5 rounded-2xl border border-white/10 bg-white/[0.04] text-xs flex items-center gap-2.5" style={{ color: "#1d4ed8" }}>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Waiting for the existing reply. This line does not mean a chart was opened.</span>
            </div>
          )}
        </div>
        )}
      </div>

    </HudGlassPanel>
    {searchHost ? createPortal(composer, searchHost) : composer}
    </div>
  );
}
