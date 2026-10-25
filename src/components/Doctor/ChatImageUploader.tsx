import React, { useRef, useState, useCallback, useEffect } from "react";
import { Plus, X, FileText, Image as ImageIcon, File, Loader2, Send, FolderOpen, Activity, Heart } from "lucide-react";

export type UploadType = "image" | "ecg" | "pdf" | "document";

export interface UploadedFile {
  file: File;
  preview: string;
  type: UploadType;
  name: string;
  size: string;
}

interface ChatImageUploaderProps {
  onSend: (text: string, file?: UploadedFile) => void;
  isLoading?: boolean;
  placeholder?: string;
  variant?: "light" | "dark";
  leading?: React.ReactNode;
  /** Bump to open the existing attach menu. Does not upload a file. */
  openMenuSignal?: number;
  /** Hide the built-in plus. The attach menu still opens from openMenuSignal. */
  hideBuiltinPlus?: boolean;
  /** Extra controls rendered just before Send. Optional. */
  trailing?: React.ReactNode;
  /** When set, the composer text is controlled by the parent (spoken orders land here). */
  value?: string;
  onValueChange?: (value: string) => void;
}

const MENU_ITEMS: { id: UploadType; label: string; hint: string; accept: string; icon: any }[] = [
  { id: "ecg", label: "Attach ECG Image", hint: "12-Lead · Lead II Rhythm", accept: "image/jpeg,image/png,image/webp,image/jpg", icon: Activity },
  { id: "image", label: "Upload Clinical Image", hint: "JPG · PNG · WEBP", accept: "image/jpeg,image/png,image/webp,image/jpg", icon: ImageIcon },
  { id: "pdf", label: "Upload PDF", hint: "application/pdf", accept: "application/pdf", icon: FileText },
  { id: "document", label: "Upload document", hint: "DOC · XLS · TXT", accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv", icon: FolderOpen },
];

export const ChatImageUploader: React.FC<ChatImageUploaderProps> = ({
  onSend,
  isLoading = false,
  placeholder = "Ask Astra AI Co-Pilot...",
  variant = "light",
  leading,
  value,
  onValueChange,
  openMenuSignal,
  hideBuiltinPlus = false,
  trailing,
}) => {
  const [uncontrolledText, setUncontrolledText] = useState("");
  const text = value !== undefined ? value : uncontrolledText;
  const setText = (next: string) => {
    if (value === undefined) setUncontrolledText(next);
    onValueChange?.(next);
  };
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRefs = useRef<Record<UploadType, HTMLInputElement | null>>({
    image: null,
    ecg: null,
    pdf: null,
    document: null,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const dark = variant === "dark";

  useEffect(() => {
    if (!openMenuSignal) return;
    setMenuOpen(true);
  }, [openMenuSignal]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // ─── FILE HANDLING ──────────────────────────────
  const handleFileSelect = useCallback((type: UploadType) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert("File too large. Max 25MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploaded({
        file,
        preview: ev.target?.result as string,
        type,
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + " MB",
      });
      setMenuOpen(false);
    };
    reader.readAsDataURL(file);

    // CRITICAL: Reset so same file can be selected again
    e.target.value = "";
  }, []);

  const triggerFileInput = (type: UploadType) => {
    inputRefs.current[type]?.click();
  };

  const clearUpload = () => setUploaded(null);

  // ─── SEND ───────────────────────────────────────
  const handleSend = () => {
    if (!text.trim() && !uploaded) return;
    if (isLoading) return;

    onSend(text, uploaded || undefined);

    // Reset
    setText("");
    setUploaded(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const typeLabel: Record<UploadType, string> = {
    ecg: "🫀 12-Lead ECG",
    image: "🖼️ Image",
    pdf: "📄 PDF",
    document: "📁 Document",
  };

  return (
    <div className={`w-full ${dark ? "bg-[#0f172a] border-t border-slate-700" : "bg-white border-t border-[#E3E8EF]"}`}>

      {/* HIDDEN FILE INPUTS — one per upload type, ref-driven, always mounted */}
      {MENU_ITEMS.map((item) => (
        <input
          key={item.id}
          ref={(el) => { inputRefs.current[item.id] = el; }}
          type="file"
          accept={item.accept}
          onChange={handleFileSelect(item.id)}
          className="hidden"
          style={{ display: "none" }}
        />
      ))}

      {/* FILE PREVIEW BAR */}
      {uploaded && (
        <div className={`px-4 py-2.5 border-b ${dark ? "bg-[#1e293b] border-slate-700" : "bg-[#F1F4F7] border-[#E3E8EF]"}`}>
          <div className="flex items-center gap-3">
            {uploaded.type === "image" ? (
              <div className="relative group">
                <img
                  src={uploaded.preview}
                  alt="Preview"
                  className={`w-14 h-14 rounded-lg object-cover border ${dark ? "border-slate-600" : "border-[#D0D9E2]"}`}
                />
                <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <ImageIcon size={16} className="text-white" />
                </div>
              </div>
            ) : (
              <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${
                uploaded.type === "pdf"
                  ? "bg-red-50 border border-red-200"
                  : "bg-blue-50 border border-blue-200"
              }`}>
                <FileText size={24} className={uploaded.type === "pdf" ? "text-red-400" : "text-blue-400"} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${dark ? "text-white" : "text-[#0B1F3A]"}`}>{uploaded.name}</p>
              <p className={`text-[10px] ${dark ? "text-slate-500" : "text-[#667085]"}`}>
                {typeLabel[uploaded.type]} • {uploaded.size} • Ready for AI analysis
              </p>
            </div>

            <button
              onClick={clearUpload}
              className={`p-1.5 hover:bg-red-500/20 rounded-lg transition ${dark ? "text-slate-400 hover:text-red-400" : "text-[#667085] hover:text-red-500"}`}
              title="Remove attachment"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* INPUT ROW — all controls (mic / plus / textarea / send) share one centered baseline */}
      <div className="flex items-center gap-1.5 px-3 py-3">

        {/* LEADING SLOT — e.g. voice mic button rendered inside the same row */}
        {leading}

        {/* CHATGPT-STYLE PLUS BUTTON → UPLOAD MENU */}
        <div className="relative shrink-0" ref={menuRef}>
          {!hideBuiltinPlus && <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={isLoading}
            className={`p-2.5 rounded-xl transition cursor-pointer ${
              uploaded
                ? "bg-[#1769AA] text-white shadow-sm"
                : dark
                ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                : "bg-white text-[#667085] hover:bg-[#F1F4F7] hover:text-[#0B1F3A] border border-[#E3E8EF] shadow-sm"
            }`}
            title="Upload image, PDF or document"
            type="button"
          >
            <Plus size={18} />
          </button>}

          {/* UPLOAD OPTIONS MENU (ChatGPT-style) */}
          {menuOpen && (
            <div className={`absolute bottom-12 left-0 w-60 rounded-xl shadow-2xl border z-50 p-1.5 ${
              dark ? "bg-[#1e293b] border-slate-700" : "bg-white border-[#E3E8EF]"
            }`}>
              <p className={`px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider ${dark ? "text-slate-500" : "text-[#98A2B3]"}`}>
                Attach to Astra
              </p>
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => triggerFileInput(item.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                      dark
                        ? "text-slate-200 hover:bg-slate-700/60"
                        : "text-[#172033] hover:bg-[#F1F4F7]"
                    }`}
                    type="button"
                  >
                    <span className={`p-1.5 rounded-lg ${
                      item.id === "image" ? "bg-emerald-500/10 text-emerald-500" :
                      item.id === "pdf" ? "bg-red-500/10 text-red-500" :
                      "bg-blue-500/10 text-blue-500"
                    }`}>
                      <Icon size={14} />
                    </span>
                    <span className="flex-1 text-left">
                      {item.label}
                      <span className={`block text-[9px] ${dark ? "text-slate-500" : "text-[#98A2B3]"}`}>{item.hint}</span>
                    </span>
                    <File size={12} className={dark ? "text-slate-500" : "text-[#98A2B3]"} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* TEXT INPUT */}
        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={uploaded ? "Add clinical notes (optional)..." : placeholder}
            rows={1}
            disabled={isLoading}
            className={`w-full text-sm rounded-xl px-3.5 py-2.5 pr-4 resize-none border focus:outline-none focus:ring-1 disabled:opacity-50 ${
              dark
                ? "bg-slate-800 text-white border-slate-700 focus:border-blue-500 focus:ring-blue-500/50 placeholder-slate-500"
                : "bg-white text-[#172033] border-[#E3E8EF] focus:border-[#1769AA] focus:ring-[#1769AA]/30 placeholder-[#98A2B3] shadow-sm"
            }`}
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
        </div>

        {trailing}
        {/* SEND BUTTON */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !uploaded) || isLoading}
          className={`p-2.5 rounded-xl transition shrink-0 cursor-pointer ${
            (text.trim() || uploaded) && !isLoading
              ? "bg-[#1769AA] text-white hover:bg-[#142B4A] shadow-sm"
              : dark
              ? "bg-slate-800 text-slate-600 cursor-not-allowed"
              : "bg-[#F1F4F7] text-[#98A2B3] cursor-not-allowed"
          }`}
          type="button"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      {/* Disclaimer */}
      <p className={`text-[10px] text-center pb-2 px-4 ${dark ? "text-slate-600" : "text-[#98A2B3]"}`}>
        Astra AI Clinical Co-Pilot • Decision support only • Final diagnosis by physician
      </p>
    </div>
  );
};