import { useState } from "react";
import { Megaphone, MessageSquare, Phone, Globe, Star, Users, TrendingUp, Target } from "lucide-react";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export function MarketingDashboard() {
  const { account } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { key: "overview", label: "Overview", icon: TrendingUp },
    { key: "campaigns", label: "Campaigns", icon: Megaphone },
    { key: "outreach", label: "Outreach", icon: Users },
    { key: "reviews", label: "Reviews", icon: Star },
    { key: "analytics", label: "Analytics", icon: Target },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient">Marketing Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          {account?.name ?? "Marketing Lead"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
            <div className="text-xs text-slate-400 mb-1">Active Campaigns</div>
            <div className="text-2xl font-bold text-white">8</div>
            <div className="text-xs text-cyan-400 mt-1">Running now</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">New Patients</div>
            <div className="text-2xl font-bold text-white">45</div>
            <div className="text-xs text-emerald-400 mt-1">This week</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Google Reviews</div>
            <div className="text-2xl font-bold text-white">4.8</div>
            <div className="text-xs text-amber-400 mt-1">★ 127 reviews</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Referral Rate</div>
            <div className="text-2xl font-bold text-white">23%</div>
            <div className="text-xs text-violet-400 mt-1">↑ 5% this month</div>
          </GlassCard>
        </div>
      )}

      {activeTab === "campaigns" && (
        <GlassCard>
          <SectionTitle title="Active Campaigns" subtitle="WhatsApp, SMS, and social media campaigns" />
          <div className="space-y-2 mt-4">
            {[
              { name: "Health Camp - July", channel: "WhatsApp", reach: 2500, status: "Active" },
              { name: "Vaccination Drive", channel: "SMS", reach: 5000, status: "Active" },
              { name: "Specialist Consultation", channel: "Facebook", reach: 1200, status: "Scheduled" },
            ].map((campaign) => (
              <div key={campaign.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-400/20 flex items-center justify-center">
                    <Megaphone size={18} className="text-violet-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{campaign.name}</div>
                    <div className="text-xs text-slate-400">{campaign.channel} · {campaign.reach} reached</div>
                  </div>
                </div>
                <Badge tone="cyan">{campaign.status}</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "outreach" && (
        <GlassCard>
          <SectionTitle title="Outreach Programs" subtitle="Village outreach and health camps" />
          <div className="space-y-2 mt-4">
            {[
              { program: "Rural Health Camp - Village X", date: "30 Jul 2025", patients: 150 },
              { program: "School Health Checkup", date: "05 Aug 2025", patients: 300 },
              { program: "Senior Citizen Camp", date: "10 Aug 2025", patients: 100 },
            ].map((outreach) => (
              <div key={outreach.program} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-sm font-semibold text-white">{outreach.program}</div>
                  <div className="text-xs text-slate-400">{outreach.date} · {outreach.patients} expected</div>
                </div>
                <Badge tone="green">Planned</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "reviews" && (
        <GlassCard>
          <SectionTitle title="Reputation Management" subtitle="Google reviews and patient feedback" />
          <div className="space-y-2 mt-4">
            {[
              { platform: "Google", rating: 4.8, reviews: 127, trend: "up" },
              { platform: "Facebook", rating: 4.5, reviews: 89, trend: "up" },
              { platform: "Practo", rating: 4.7, reviews: 64, trend: "stable" },
            ].map((review) => (
              <div key={review.platform} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-400/20 flex items-center justify-center">
                    <Star size={18} className="text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{review.platform}</div>
                    <div className="text-xs text-slate-400">{review.reviews} reviews</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">★ {review.rating}</div>
                  <div className="text-xs text-emerald-400">↑ Trending up</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "analytics" && (
        <GlassCard>
          <SectionTitle title="Growth Analytics" subtitle="Patient acquisition and marketing ROI" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">New Patients</div>
              <div className="text-xl font-bold text-white">+45</div>
              <div className="text-xs text-emerald-400">This week</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Campaign ROI</div>
              <div className="text-xl font-bold text-cyan-400">320%</div>
              <div className="text-xs text-slate-400">Excellent</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Referral Doctors</div>
              <div className="text-xl font-bold text-white">18</div>
              <div className="text-xs text-violet-400">Active</div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
