import { useState } from "react";
import { Settings, Users, Shield, Database, Server, Bell, Lock, Activity } from "lucide-react";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";

import { SuperAdminPanel } from "@/components/CommandCentre/SuperAdminPanel";
import { CalibrationDashboard } from "@/astra/reflex/CalibrationDashboard";

export function AdminDashboard() {
  const { account } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { key: "overview", label: "Overview", icon: Activity },
    { key: "admin-panel", label: "Super Admin Panel", icon: Settings },
    { key: "calibration", label: "Calibration", icon: Activity },
    { key: "departments", label: "Departments", icon: Users },
    { key: "permissions", label: "Permissions", icon: Shield },
    { key: "system", label: "System", icon: Server },
    { key: "audit", label: "Audit Logs", icon: Database },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient">Administration Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          {account?.name ?? "System Admin"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border",
              activeTab === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            <Icon size={16} className={activeTab === key ? "text-neon-cyan" : ""} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">System Status</div>
            <div className="text-2xl font-bold text-emerald-400">Healthy</div>
            <div className="text-xs text-slate-400 mt-1">All services running</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Active Users</div>
            <div className="text-2xl font-bold text-white">89</div>
            <div className="text-xs text-cyan-400 mt-1">Online now</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Departments</div>
            <div className="text-2xl font-bold text-white">12</div>
            <div className="text-xs text-slate-400 mt-1">Active</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">AI Status</div>
            <div className="text-2xl font-bold text-violet-400">Active</div>
            <div className="text-xs text-slate-400 mt-1">Astra AI monitoring</div>
          </GlassCard>
        </div>
      )}

      {activeTab === "admin-panel" && (
        <SuperAdminPanel />
      )}

      {activeTab === "calibration" && (
        <CalibrationDashboard />
      )}

      {activeTab === "departments" && (
        <GlassCard>
          <SectionTitle title="Department Management" subtitle="Manage hospital departments and units" />
          <div className="space-y-2 mt-4">
            {["OPD", "IPD", "Pharmacy", "Laboratory", "Radiology", "OT", "Ward", "ICU", "Emergency", "Nursing"].map((dept) => (
              <div key={dept} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
                    <Settings size={18} className="text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{dept}</div>
                    <div className="text-xs text-slate-400">Department</div>
                  </div>
                </div>
                <Badge tone="green">Active</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "permissions" && (
        <GlassCard>
          <SectionTitle title="User Permissions" subtitle="Role-based access control" />
          <div className="space-y-2 mt-4">
            {[
              { role: "CEO", users: 2, access: "Full Access" },
              { role: "Doctor", users: 15, access: "Clinical + Patient Data" },
              { role: "Reception", users: 8, access: "Registration + Appointments" },
              { role: "Pharmacy", users: 6, access: "Pharmacy + Inventory" },
              { role: "Lab", users: 5, access: "Lab + Reports" },
              { role: "Ward", users: 12, access: "Ward + Nursing" },
            ].map((perm) => (
              <div key={perm.role} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-sm font-semibold text-white">{perm.role}</div>
                  <div className="text-xs text-slate-400">{perm.users} users</div>
                </div>
                <Badge tone="cyan">{perm.access}</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "system" && (
        <GlassCard>
          <SectionTitle title="System Configuration" subtitle="Server, database, and AI settings" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Server size={18} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Server Status</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>Port: 3000</div>
                <div>Uptime: 99.9%</div>
                <div>Last restart: 2 days ago</div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database size={18} className="text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Database</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>Status: Connected</div>
                <div>Size: 2.5 GB</div>
                <div>Backup: Daily</div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell size={18} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>WhatsApp: Enabled</div>
                <div>Telegram: Enabled</div>
                <div>Email: Enabled</div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lock size={18} className="text-red-400" />
                <h3 className="text-sm font-semibold text-white">Security</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>SSL: Active</div>
                <div>2FA: Enabled</div>
                <div>Last audit: Today</div>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === "audit" && (
        <GlassCard>
          <SectionTitle title="Audit Logs" subtitle="System activity and security logs" />
          <div className="space-y-2 mt-4">
            {[
              { user: "Dr. Admin", action: "Updated system settings", time: "2 mins ago", ip: "192.168.1.10" },
              { user: "Meera Nair", action: "Registered new patient", time: "5 mins ago", ip: "192.168.1.15" },
              { user: "Sana Iqbal", action: "Processed prescription", time: "8 mins ago", ip: "192.168.1.20" },
              { user: "System", action: "Backup completed", time: "1 hour ago", ip: "localhost" },
              { user: "Astra AI", action: "Flagged duplicate registration", time: "2 hours ago", ip: "system" },
            ].map((log) => (
              <div key={log.time} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-sm font-semibold text-white">{log.user}</div>
                  <div className="text-xs text-slate-400">{log.action}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">{log.time}</div>
                  <div className="text-[10px] text-slate-500">{log.ip}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
