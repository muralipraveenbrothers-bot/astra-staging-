import { useState, useEffect } from "react";
import { Building2, Users, Save, Shield, UserX, UserCheck, Key, Plus, LogOut } from "lucide-react";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useAuth, ROLE_LABEL, type Account, type Role } from "@/lib/auth";
import { toast } from "sonner";
import { SecureLinkGenerator } from "../Communications/SecureLinkGenerator";

interface HospitalProfile {
  name: string;
  location: string;
  helpline: string;
}

export function SuperAdminPanel() {
  const { accounts, updateAccount, createAccount } = useAuth();
  const [profile, setProfile] = useState<HospitalProfile>({ name: "", location: "", helpline: "" });
  const [isSaving, setIsSaving] = useState(false);
  
  // New User Form State
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("reception");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserSubtitle, setNewUserSubtitle] = useState("");

  useEffect(() => {
    fetch("/api/hospital/profile", {
      headers: { Authorization: `Bearer ${localStorage.getItem("astra.serverToken")}` }
    })
      .then(r => r.json())
      .then(d => {
        if (d?.profile) {
          setProfile({
            name: d.profile.name || "",
            location: d.profile.location || "",
            helpline: d.profile.helpline || ""
          });
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/hospital/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("astra.serverToken")}`
        },
        body: JSON.stringify(profile)
      });
      if (!res.ok) throw new Error("Failed to save profile");
      toast.success("Hospital profile updated successfully");
    } catch (e) {
      toast.error("Error updating profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = (accountId: string) => {
    const newPin = prompt("Enter new 4-digit PIN for this account:");
    if (newPin && newPin.length >= 4) {
      updateAccount(accountId, { name: accounts.find(a => a.id === accountId)?.name || accountId, pin: newPin });
      toast.success(`Password updated for ${accountId}`);
    } else if (newPin !== null) {
      toast.error("PIN must be at least 4 characters");
    }
  };

  const handleCreateUser = async () => {
    if (!newUserId || !newUserName || !newUserPin) {
      toast.error("ID, Name, and PIN are required");
      return;
    }
    const success = await createAccount({
      id: newUserId.toLowerCase().replace(/\s+/g, '-'),
      name: newUserName,
      role: newUserRole,
      pin: newUserPin,
      subtitle: newUserSubtitle || ROLE_LABEL[newUserRole]
    });
    
    if (success) {
      toast.success("User created successfully");
      setShowNewUser(false);
      setNewUserId(""); setNewUserName(""); setNewUserPin(""); setNewUserSubtitle("");
    } else {
      toast.error("Failed to create user. Ensure ID is unique and valid.");
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard className="border-cyan-500/30">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Hospital Metadata" subtitle="Core identity configurations" />
          <button onClick={handleSaveProfile} disabled={isSaving} className="btn-primary bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-2 px-4 py-2 rounded-md font-medium disabled:opacity-50 transition-colors">
            <Save size={16} /> Save Changes
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Hospital Name</label>
            <input 
              type="text"
              value={profile.name}
              onChange={e => setProfile({ ...profile, name: e.target.value })}
              className="w-full bg-black/40 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Location</label>
            <input 
              type="text"
              value={profile.location}
              onChange={e => setProfile({ ...profile, location: e.target.value })}
              className="w-full bg-black/40 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Helpline Number</label>
            <input 
              type="text"
              value={profile.helpline}
              onChange={e => setProfile({ ...profile, helpline: e.target.value })}
              className="w-full bg-black/40 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 outline-none transition-colors"
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Staff Directory" subtitle="Manage credentials and roles" />
          <button onClick={() => setShowNewUser(!showNewUser)} className="border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors">
            {showNewUser ? "Cancel" : <><Plus size={16} /> Add Staff</>}
          </button>
        </div>

        {showNewUser && (
          <div className="bg-white/5 border border-cyan-500/30 rounded-xl p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Login ID</label>
              <input type="text" placeholder="e.g. nurse-joy" value={newUserId} onChange={e => setNewUserId(e.target.value)} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Full Name</label>
              <input type="text" placeholder="Joy" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Role</label>
              <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as Role)} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white">
                {Object.entries(ROLE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Password (PIN)</label>
              <input type="text" placeholder="1234" value={newUserPin} onChange={e => setNewUserPin(e.target.value)} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white" />
            </div>
            <div className="flex items-end">
              <button onClick={handleCreateUser} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded px-3 py-2 h-8 transition-colors">Create Account</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map(acc => (
            <div key={acc.id} className="flex flex-col rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-cyan-500/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-white">{acc.name}</div>
                <Badge tone={acc.role === "ceo" || acc.role === "doctor" ? "cyan" : "neutral"}>{ROLE_LABEL[acc.role] || acc.role}</Badge>
              </div>
              <div className="text-xs text-slate-400 mt-1 mb-3">{acc.subtitle || "Staff Member"}</div>
              
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                <span className="text-[10px] text-slate-500 font-mono">ID: {acc.id}</span>
                <button onClick={() => handleUpdatePassword(acc.id)} className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-400/10 px-2 py-1 rounded">
                  <Key size={12} /> Reset PIN
                </button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <SecureLinkGenerator />
    </div>
  );
}
