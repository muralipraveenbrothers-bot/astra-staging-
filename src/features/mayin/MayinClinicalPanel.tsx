import { useState } from "react";
import { Brain, Activity, FileText, HeartPulse, Pill, FlaskConical, X, AlertTriangle, Microscope, Stethoscope, FileSearch, List, ListStart, ListEnd, Check, AlertOctagon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinClinicalPanelProps {
  messages: Array<{from: 'user' | 'assistant'; text: string}>;
  patient: any;
  onVisualizationRequest: (type: string) => void;
}

export function MayinClinicalPanel({
  messages,
  patient,
  onVisualizationRequest,
}: MayinClinicalPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  // Extract the last assistant message for display
  const lastAssistantMessage = messages.filter(m => m.from === "assistant").pop();

  // Extract clinical data from patient object
  const clinicalData = {
    summary: patient?.clinicalSummary || "-",
    redFlags: patient?.redFlags || [],
    differential: patient?.differential || [],
    investigations: patient?.investigations || [],
    management: patient?.management || [],
    recommendations: patient?.recommendations || [],
  };

  // Render content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "summary":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Clinical Summary</h4>
            <p className="text-xs text-slate-200">{clinicalData.summary}</p>
          </div>
        );
      case "red-flags":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Red Flags</h4>
            {clinicalData.redFlags.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {clinicalData.redFlags.map((flag: string, i: number) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No red flags identified</p>
            )}
          </div>
        );
      case "differential":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Differential Diagnosis</h4>
            {clinicalData.differential.length > 0 ? (
              <ol className="list-decimal list-inside text-xs text-slate-200 space-y-1">
                {clinicalData.differential.map((diagnosis: string, i: number) => (
                  <li key={i}>{diagnosis}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-400">No differential diagnosis available</p>
            )}
          </div>
        );
      case "investigations":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Pending Investigations</h4>
            {clinicalData.investigations.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {clinicalData.investigations.map((investigation: string, i: number) => (
                  <li key={i}>{investigation}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No pending investigations</p>
            )}
          </div>
        );
      case "management":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Management Options</h4>
            {clinicalData.management.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {clinicalData.management.map((option: string, i: number) => (
                  <li key={i}>{option}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No management options available</p>
            )}
          </div>
        );
      case "recommendations":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Recommendations</h4>
            {clinicalData.recommendations.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {clinicalData.recommendations.map((recommendation: string, i: number) => (
                  <li key={i}>{recommendation}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No recommendations available</p>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex-1 bg-slate-800/30 border-r border-white/5 p-4 flex flex-col transition-all duration-300 ${expanded ? "max-w-[600px]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Clinical Intelligence</h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-slate-700/50"
        >
          {expanded ? <X className="w-4 h-4" /> : <FileSearch className="w-4 h-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {[
          { id: "summary", label: "Summary", icon: <FileText className="w-3 h-3" /> },
          { id: "red-flags", label: "Red Flags", icon: <AlertOctagon className="w-3 h-3" /> },
          { id: "differential", label: "Differential", icon: <List className="w-3 h-3" /> },
          { id: "investigations", label: "Investigations", icon: <Microscope className="w-3 h-3" /> },
          { id: "management", label: "Management", icon: <Stethoscope className="w-3 h-3" /> },
          { id: "recommendations", label: "Recommendations", icon: <Check className="w-3 h-3" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs ${activeTab === tab.id ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {renderTabContent()}
      </div>

      {/* Last Assistant Message */}
      {lastAssistantMessage && (
        <div className="mt-4 p-3 bg-emerald-500/10 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-medium text-slate-300">Last Analysis</h4>
          </div>
          <p className="text-xs text-slate-200 whitespace-pre-wrap">{lastAssistantMessage.text}</p>
        </div>
      )}
    </div>
  );
}

export default MayinClinicalPanel;