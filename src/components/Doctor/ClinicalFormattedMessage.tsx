import React from "react";
import { Sparkles, HeartPulse, ShieldCheck, Stethoscope, BookOpen, AlertCircle, CheckCircle2 } from "lucide-react";

interface ClinicalFormattedMessageProps {
  content: string;
  isAi?: boolean;
  pluginUsed?: string;
  modelUsed?: string;
}

export const ClinicalFormattedMessage: React.FC<ClinicalFormattedMessageProps> = ({
  content,
  isAi = true,
  pluginUsed,
  modelUsed,
}) => {
  if (!isAi) {
    return <div className="text-sm font-sans text-slate-800 whitespace-pre-wrap">{content}</div>;
  }

  // Helper to render formatted text line by line with natural typography
  const renderFormattedLines = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Empty line -> spacing
      if (!trimmed) {
        elements.push(<div key={`empty-${idx}`} className="h-2.5" />);
        return;
      }

      // Divider line --- or ***
      if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
        elements.push(
          <div key={`hr-${idx}`} className="my-3 border-b border-[#E3E8EF]" />
        );
        return;
      }

      // Headers (### or ## or #)
      if (trimmed.startsWith("#")) {
        const headerText = trimmed.replace(/^#+\s*/, "");
        elements.push(
          <div
            key={`h-${idx}`}
            className="mt-3 mb-1.5 p-2 bg-[#F7F8FA] border-l-4 border-[#1769AA] rounded-r-lg font-bold text-[#0B1F3A] text-xs flex items-center gap-2 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1769AA] shrink-0" />
            <span>{formatBoldText(headerText)}</span>
          </div>
        );
        return;
      }

      // Callouts / Quotes (> text)
      if (trimmed.startsWith(">")) {
        const quoteText = trimmed.replace(/^>\s*/, "");
        elements.push(
          <div
            key={`quote-${idx}`}
            className="my-2 p-2.5 bg-[#E6F4ED] border border-[#16805B]/30 rounded-xl text-xs text-[#126447] flex items-start gap-2 italic"
          >
            <ShieldCheck className="w-4 h-4 text-[#16805B] shrink-0 mt-0.5" />
            <div>{formatBoldText(quoteText)}</div>
          </div>
        );
        return;
      }

      // Bullet points (* or - or • or 1.)
      if (/^[\*\-•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        const listText = trimmed.replace(/^([\*\-•]|\d+\.)\s+/, "");
        const isNumbered = /^\d+\.\s+/.test(trimmed);

        elements.push(
          <div key={`li-${idx}`} className="flex items-start gap-2 my-1 text-xs text-[#172033] leading-relaxed pl-1">
            <span className="shrink-0 mt-1">
              {isNumbered ? (
                <span className="w-4 h-4 rounded-full bg-[#1769AA]/10 text-[#1769AA] font-bold text-[10px] flex items-center justify-center">
                  {trimmed.match(/^\d+/)?.[0]}
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#1769AA] inline-block" />
              )}
            </span>
            <div className="flex-1">{formatBoldText(listText)}</div>
          </div>
        );
        return;
      }

      // Conversational Greeting / Closing (e.g., "Good day, Doctor", "Doctor,", "💬")
      if (
        /^(good day|hello|dear doctor|doctor|understand|certainly|i've reviewed|let's analyze|💬)/i.test(trimmed)
      ) {
        elements.push(
          <p key={`p-${idx}`} className="my-1.5 text-xs text-[#0B1F3A] font-medium leading-relaxed bg-[#F1F4F7]/60 p-2 rounded-lg border border-[#E3E8EF]/80">
            {formatBoldText(trimmed)}
          </p>
        );
        return;
      }

      // Standard paragraph
      elements.push(
        <p key={`p-${idx}`} className="my-1 text-xs text-[#172033] leading-relaxed">
          {formatBoldText(trimmed)}
        </p>
      );
    });

    return elements;
  };

  // Helper to replace **bold** or *italic* syntax with styled tags
  const formatBoldText = (text: string): React.ReactNode => {
    // Split by **text**
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const clean = part.slice(2, -2);
        return (
          <strong key={i} className="font-bold text-[#0B1F3A] bg-[#F1F4F7] px-1 py-0.5 rounded border border-[#E3E8EF]/60">
            {clean}
          </strong>
        );
      } else if (part.startsWith("*") && part.endsWith("*")) {
        const clean = part.slice(1, -1);
        return <em key={i} className="italic text-[#1769AA] font-medium">{clean}</em>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-1 font-sans">
      {/* Header Badge Layer */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E3E8EF] pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="bg-[#E6F4ED] text-[#16805B] border border-[#16805B]/30 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1">
            <HeartPulse className="w-3 h-3 text-[#16805B]" />
            Empathetic Co-Pilot
          </span>
          {pluginUsed && (
            <span className="bg-[#F1F4F7] text-[#1769AA] border border-[#E3E8EF] px-2 py-0.5 rounded-md text-[10px] font-semibold">
              {pluginUsed}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#667085] flex items-center gap-1">
          <Stethoscope className="w-3 h-3 text-[#1769AA]" />
          {modelUsed || "Astra Clinical Reasoning"}
        </span>
      </div>

      {/* Rendered Body */}
      <div className="space-y-0.5">{renderFormattedLines(content)}</div>
    </div>
  );
};
