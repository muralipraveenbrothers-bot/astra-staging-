import { useState } from "react";
import { Link, Copy, Check, Shield } from "lucide-react";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useAuth, ROLE_LABEL, type Account } from "@/lib/auth";
import { toast } from "sonner";

export function SecureLinkGenerator() {
  const { accounts } = useAuth();
  const [selectedUser, setSelectedUser] = useState("");
  const [route, setRoute] = useState("/doctor");
  const [expires, setExpires] = useState("60");
  const [generatedLink, setGeneratedLink] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!selectedUser) {
      toast.error("Please select a user account");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/communications/secure-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("astra.serverToken")}`
        },
        body: JSON.stringify({
          targetAccountId: selectedUser,
          route: route,
          expiresMinutes: parseInt(expires, 10)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate link");

      // Construct absolute URL for the frontend
      const baseUrl = window.location.origin + window.location.pathname;
      const fullUrl = `${baseUrl}#${data.path}`;
      setGeneratedLink(fullUrl);
      setCopied(false);
      toast.success("Secure link generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate secure link");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Link copied to clipboard");
  };

  return (
    <GlassCard className="border-violet-500/30">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={20} className="text-violet-400" />
        <SectionTitle title="Secure Link Generator" subtitle="Create time-bound magic links for staff" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="text-xs text-slate-400 font-semibold mb-1 block">Target User</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className="w-full bg-black/40 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-violet-500 outline-none">
            <option value="">Select a user...</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name} ({ROLE_LABEL[acc.role]})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 font-semibold mb-1 block">Dashboard Route</label>
          <select value={route} onChange={e => setRoute(e.target.value)} className="w-full bg-black/40 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-violet-500 outline-none">
            <option value="/doctor">Doctor</option>
            <option value="/reception">Reception</option>
            <option value="/ward">Ward</option>
            <option value="/ot">Operation Theatre</option>
            <option value="/pharmacy">Pharmacy</option>
            <option value="/lab">Laboratory</option>
            <option value="/radiology">Radiology</option>
            <option value="/billing">Billing</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 font-semibold mb-1 block">Expiry (Minutes)</label>
          <input 
            type="number" 
            min="5" 
            max="1440" 
            value={expires} 
            onChange={e => setExpires(e.target.value)}
            className="w-full bg-black/40 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-violet-500 outline-none"
          />
        </div>
      </div>

      <button onClick={handleGenerate} disabled={isGenerating || !selectedUser} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-md py-2 mb-4 disabled:opacity-50 transition-colors">
        Generate Secure Link
      </button>

      {generatedLink && (
        <div className="bg-white/5 border border-violet-500/30 rounded-lg p-3 flex items-center justify-between gap-3">
          <div className="text-sm font-mono text-cyan-300 truncate">{generatedLink}</div>
          <button onClick={copyToClipboard} className="flex items-center gap-2 border border-violet-500/50 text-violet-400 hover:bg-violet-500/10 whitespace-nowrap px-3 py-1.5 rounded text-sm transition-colors">
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </GlassCard>
  );
}
