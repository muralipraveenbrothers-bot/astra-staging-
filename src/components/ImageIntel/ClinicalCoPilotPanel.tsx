import React, { useState, useEffect } from "react";
import {
    AlertTriangle,
    BookOpen,
    Bot,
    CheckCircle2,
    ClipboardList,
    Copy,
    Crosshair,
    FileText,
    HeartPulse,
    Layers,
    Loader2,
    MapPin,
    Microscope,
    ShieldAlert,
    Sparkles,
    Stethoscope,
    Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { analyzeClinicalImage, ClinicalCoPilotOutput, AnatomicalStructure } from "@/lib/clinicalCoPilotEngine";

interface ClinicalCoPilotPanelProps {
    imageUrl?: string;
    imageData?: string;
    query?: string;
    patientName?: string;
    patientUhid?: string;
    patientAge?: number;
    procedureName?: string;
    bodyRegionHint?: string;
    sideHint?: string;
    autoAnalyze?: boolean;
}

const LAYER_META: Record<AnatomicalStructure["layer"], { label: string; icon: React.ReactNode; color: string }> = {
    SKIN: { label: "Skin / Soft Tissue", icon: <Layers className="w-3 h-3" />, color: "text-rose-300" },
    SUBCUTANEOUS: { label: "Subcutaneous / Fascia", icon: <Layers className="w-3 h-3" />, color: "text-orange-300" },
    TENDON_LIGAMENT: { label: "Tendons / Ligaments", icon: <HeartPulse className="w-3 h-3" />, color: "text-indigo-300" },
    MUSCLE: { label: "Muscles", icon: <HeartPulse className="w-3 h-3" />, color: "text-pink-300" },
    BONE_JOINT: { label: "Bones / Joints", icon: <Crosshair className="w-3 h-3" />, color: "text-slate-300" },
    NERVE: { label: "Nerves", icon: <Zap className="w-3 h-3" />, color: "text-amber-300" },
    ARTERY: { label: "Arteries", icon: <HeartPulse className="w-3 h-3" />, color: "text-red-300" },
    VEIN: { label: "Veins", icon: <HeartPulse className="w-3 h-3" />, color: "text-cyan-300" },
    SPECIALIZED: { label: "Specialized Structures", icon: <Microscope className="w-3 h-3" />, color: "text-emerald-300" },
};

const TIMELINE_META: Record<ClinicalCoPilotOutput["priorityActions"][number]["timeline"], { label: string; color: string }> = {
    IMMEDIATE_0_5_MIN: { label: "IMMEDIATE (0-5 min)", color: "bg-rose-600" },
    URGENT_5_30_MIN: { label: "URGENT (5-30 min)", color: "bg-amber-600" },
    EVALUATE: { label: "EVALUATE", color: "bg-blue-600" },
    MONITOR: { label: "MONITOR", color: "bg-emerald-600" },
};

const VISIBILITY_BADGE: Record<AnatomicalStructure["visibility"], { label: string; className: string }> = {
    VISIBLE: { label: "VISIBLE", className: "bg-rose-500/20 text-rose-300" },
    LIKELY: { label: "LIKELY", className: "bg-amber-500/20 text-amber-300" },
    SUSPECTED: { label: "SUSPECTED", className: "bg-cyan-500/20 text-cyan-300" },
    NOT_ASSESSABLE: { label: "NOT_ASSESSABLE", className: "bg-slate-700 text-slate-300" },
};

export const ClinicalCoPilotPanel: React.FC<ClinicalCoPilotPanelProps> = ({
    imageUrl,
    imageData,
    query = "Analyze this medical image",
    patientName,
    patientUhid,
    patientAge,
    procedureName,
    bodyRegionHint,
    sideHint,
    autoAnalyze = true,
}) => {
    const [analysis, setAnalysis] = useState<ClinicalCoPilotOutput | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<"summary" | "anatomy" | "actions" | "emr">("summary");
    const [copied, setCopied] = useState(false);

    const runAnalysis = async () => {
        setIsAnalyzing(true);
        setAnalysis(null);
        try {
            const result = await analyzeClinicalImage(imageData || imageUrl || "", query, {
                patientName,
                patientUhid,
                patientAge,
                procedureName,
                bodyRegionHint,
                sideHint,
            });
            setAnalysis(result);
        } catch (err) {
            console.error("Clinical Co-Pilot analysis failed", err);
            toast.error("Analysis failed", { description: "Unable to complete clinical image analysis." });
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        if (autoAnalyze && (imageUrl || imageData)) {
            runAnalysis();
        }
    }, [autoAnalyze, imageUrl, imageData]);

    const handleCopyEmr = () => {
        if (!analysis) return;
        navigator.clipboard.writeText(analysis.emrDocumentationSnippet).then(() => {
            setCopied(true);
            toast.success("EMR snippet copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[80vh]">
            {/* Panel Header */}
            <div className="p-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        <Bot className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-black text-white uppercase tracking-wider">
                                Astra Clinical Co-Pilot
                            </h2>
                            <Badge tone="cyan">AI Vision 4.7</Badge>
                        </div>
                        <p className="text-[10px] text-slate-400">
                            Layer-by-layer anatomical identification & clinical prioritization
                        </p>
                    </div>
                </div>

                <button
                    onClick={runAnalysis}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow flex items-center gap-1.5 transition-all"
                >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAnalyzing ? "Analyzing..." : "Re-Analyze"}
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="p-2 border-b border-slate-800 bg-slate-950/60 flex items-center gap-1 text-xs overflow-x-auto">
                {[
                    { id: "summary", label: "📍 Region & Quality", icon: <MapPin className="w-3 h-3" /> },
                    { id: "anatomy", label: "🏷️ Anatomical Labels", icon: <Layers className="w-3 h-3" /> },
                    { id: "actions", label: "⚠️ Priority Actions", icon: <ShieldAlert className="w-3 h-3" /> },
                    { id: "emr", label: "📝 EMR Note", icon: <ClipboardList className="w-3 h-3" /> },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === tab.id
                            ? "bg-blue-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Loading State */}
            {isAnalyzing && (
                <div className="flex-1 p-8 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <div className="text-center">
                        <p className="text-sm font-bold text-white">Astra Clinical Co-Pilot is analyzing the image...</p>
                        <p className="text-xs text-slate-400 mt-1">
                            Applying image enhancement, anatomical identification, and injury assessment
                        </p>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!isAnalyzing && !analysis && (
                <div className="flex-1 p-8 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="p-4 rounded-2xl bg-slate-800/50 text-cyan-400">
                        <Stethoscope className="w-10 h-10" />
                    </div>
                    <p className="text-sm font-bold text-white">Ready for Clinical Co-Pilot Analysis</p>
                    <p className="text-xs text-slate-400 max-w-md">
                        Upload or select a medical image to receive structured layer-by-layer anatomical
                        identification, injury assessment, and clinical prioritization guidance.
                    </p>
                    <button
                        onClick={runAnalysis}
                        className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow flex items-center gap-1.5"
                    >
                        <Sparkles className="w-4 h-4" /> Analyze Image
                    </button>
                </div>
            )}

            {/* Analysis Output */}
            {analysis && !isAnalyzing && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* ==================== SUMMARY TAB ==================== */}
                    {activeTab === "summary" && (
                        <>
                            {/* Region & Orientation */}
                            <section className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                                <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-cyan-400" /> 📍 Region & Orientation
                                </h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                                        <span className="text-[10px] text-slate-500 block">Body Part</span>
                                        <span className="text-white font-bold">{analysis.region.bodyPart}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                                        <span className="text-[10px] text-slate-500 block">Side</span>
                                        <span className="text-white font-bold">{analysis.region.side}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 col-span-2">
                                        <span className="text-[10px] text-slate-500 block">Specific Area</span>
                                        <span className="text-white font-bold">{analysis.region.specificArea}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 col-span-2">
                                        <span className="text-[10px] text-slate-500 block">Anatomical Position</span>
                                        <span className="text-white font-bold">{analysis.region.anatomicalPosition}</span>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                    <Badge tone="cyan">{analysis.imageCategory}</Badge>
                                    {analysis.pediatricFlag && (
                                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                            PEDIATRIC PATIENT
                                        </span>
                                    )}
                                </div>
                            </section>

                            {/* Image Quality */}
                            <section className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                                <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Microscope className="w-3.5 h-3.5 text-blue-400" /> 🔍 Image Quality & Enhancement
                                </h3>
                                <p className="text-xs text-slate-300 mb-2">{analysis.imageQuality.originalAssessment}</p>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {analysis.imageQuality.enhancementsApplied.map((e, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 text-[9px] font-mono border border-blue-500/30">
                                            {e}
                                        </span>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500">Confidence:</span>
                                    <Badge
                                        tone={
                                            analysis.imageQuality.confidence === "HIGH" ? "green" :
                                                analysis.imageQuality.confidence === "MEDIUM" ? "amber" : "red"
                                        }
                                    >
                                        {analysis.imageQuality.confidence}
                                    </Badge>
                                </div>
                            </section>

                            {/* Red Flags */}
                            <section className="rounded-xl bg-rose-950/30 border border-rose-800/40 p-3.5">
                                <h3 className="text-xs font-black text-rose-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Red Flags
                                </h3>
                                <ul className="space-y-1.5">
                                    {analysis.redFlags.map((flag, i) => (
                                        <li key={i} className="text-xs text-rose-200 flex items-start gap-1.5">
                                            <span className="mt-0.5 text-rose-400">•</span>
                                            {flag}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {/* Injury Assessment */}
                            <section className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                                <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <HeartPulse className="w-3.5 h-3.5 text-emerald-400" /> 🩸 Injury Assessment
                                </h3>
                                <p className="text-xs font-bold text-white mb-2">{analysis.injuryAssessment.primaryInjury}</p>
                                <div className="space-y-2 text-xs">
                                    <div>
                                        <span className="text-[10px] text-slate-500 block mb-1">Depth / Layers Involved:</span>
                                        <div className="flex flex-wrap gap-1">
                                            {analysis.injuryAssessment.depthLayersInvolved.map((d, i) => (
                                                <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-mono">
                                                    {d}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {analysis.injuryAssessment.structuresDamaged.length > 0 && (
                                        <div>
                                            <span className="text-[10px] text-slate-500 block mb-1">Structures Damaged:</span>
                                            <ul className="space-y-1">
                                                {analysis.injuryAssessment.structuresDamaged.map((s, i) => (
                                                    <li key={i} className="text-rose-300 flex items-start gap-1.5">
                                                        <span className="text-rose-500">◆</span> {s}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {analysis.injuryAssessment.structuresAtRisk.length > 0 && (
                                        <div>
                                            <span className="text-[10px] text-slate-500 block mb-1">Structures at Risk:</span>
                                            <ul className="space-y-1">
                                                {analysis.injuryAssessment.structuresAtRisk.map((s, i) => (
                                                    <li key={i} className="text-amber-300 flex items-start gap-1.5">
                                                        <span className="text-amber-500">⚠</span> {s}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-mono">
                                            Contamination: {analysis.injuryAssessment.contaminationLevel}
                                        </span>
                                        {analysis.injuryAssessment.foreignBodies.length > 0 && (
                                            <span className="px-2 py-0.5 rounded bg-rose-900/40 text-rose-300 text-[9px] font-mono">
                                                Foreign Bodies: {analysis.injuryAssessment.foreignBodies.join(", ")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </>
                    )}

                    {/* ==================== ANATOMY TAB ==================== */}
                    {activeTab === "anatomy" && (
                        <section className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                            <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3">
                                🏷️ Anatomical Labels <span className="text-slate-500">(Superficial → Deep)</span>
                            </h3>
                            <div className="space-y-2">
                                {analysis.anatomicalLabels.map((structure, i) => {
                                    const meta = LAYER_META[structure.layer];
                                    const visBadge = VISIBILITY_BADGE[structure.visibility];
                                    return (
                                        <div key={i} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 transition-all">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`${meta.color}`}>{meta.icon}</span>
                                                    <div>
                                                        <span className="text-[11px] text-slate-500 font-mono block">{meta.label}</span>
                                                        <strong className="text-[11px] text-white block">{structure.label}</strong>
                                                    </div>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${visBadge.className}`}>
                                                    {visBadge.label}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-snug">{structure.condition}</p>
                                            {structure.proximityToInjury && (
                                                <p className="text-[10px] text-amber-300 mt-1">📍 {structure.proximityToInjury}</p>
                                            )}
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {structure.bleedingRisk && (
                                                    <span className="px-1.5 py-0.5 rounded bg-rose-900/40 text-rose-300 text-[8px] font-mono">
                                                        Bleeding Risk: {structure.bleedingRisk}
                                                    </span>
                                                )}
                                                {structure.caliber && (
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] font-mono">
                                                        Caliber: {structure.caliber}
                                                    </span>
                                                )}
                                                {structure.course && (
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] font-mono">
                                                        Course: {structure.course}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== ACTIONS TAB ==================== */}
                    {activeTab === "actions" && (
                        <section className="space-y-3">
                            <h3 className="text-xs font-black text-white uppercase tracking-wider">
                                ⚠️ Priority Action Plan
                            </h3>

                            {/* Priority Actions Timeline */}
                            <div className="space-y-2">
                                {analysis.priorityActions.map((action, i) => {
                                    const meta = TIMELINE_META[action.timeline];
                                    return (
                                        <div key={i} className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                                            <div className={`px-3 py-1.5 ${meta.color} text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5`}>
                                                <Zap className="w-3 h-3" /> {meta.label}
                                            </div>
                                            <div className="p-3">
                                                <p className="text-xs text-white font-bold">{action.action}</p>
                                                <p className="text-[10px] text-slate-400 mt-1">{action.rationale}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Suggested Next Steps */}
                            <section className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                                <h4 className="text-xs font-black text-white uppercase tracking-wider mb-2">Suggested Next Steps</h4>
                                <ul className="space-y-1.5">
                                    {analysis.suggestedNextSteps.map((step, i) => (
                                        <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                            {step}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {/* Disclaimer */}
                            <section className="rounded-xl bg-amber-950/30 border border-amber-800/40 p-3 flex items-start gap-2">
                                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-200">{analysis.disclaimer}</p>
                            </section>

                            {analysis.pediatricFlag && analysis.pediatricNote && (
                                <section className="rounded-xl bg-blue-950/30 border border-blue-800/40 p-3 flex items-start gap-2">
                                    <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-blue-200">{analysis.pediatricNote}</p>
                                </section>
                            )}
                        </section>
                    )}

                    {/* ==================== EMR TAB ==================== */}
                    {activeTab === "emr" && (
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                                    📝 EMR Documentation Snippet
                                </h3>
                                <button
                                    onClick={handleCopyEmr}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                                >
                                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? "Copied!" : "Copy to Clipboard"}
                                </button>
                            </div>

                            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-300 bg-slate-950 border border-slate-800 rounded-xl p-4">
                                {analysis.emrDocumentationSnippet}
                            </pre>

                            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                                <h4 className="text-xs font-black text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-blue-400" /> Safety Governance
                                </h4>
                                <ul className="space-y-1.5 text-[11px] text-slate-400">
                                    <li>• This analysis is for clinical decision support only.</li>
                                    <li>• Neurovascular status cannot be confirmed from image alone — physical check mandatory.</li>
                                    <li>• No definitive treatment prescriptions are provided by this AI.</li>
                                    <li>• Final diagnosis and treatment decisions remain the responsibility of the attending physician.</li>
                                </ul>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClinicalCoPilotPanel;