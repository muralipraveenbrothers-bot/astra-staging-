import { useState } from "react";
import { Camera, Clock, LogIn, LogOut, MapPin, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { nowTime, sleep, uid } from "@/lib/utils";

export function Attendance() {
  const { attendance, setAttendance, staff } = useStore();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(staff[0]?.name ?? "");

  const clockIn = () => {
    setCaptureOpen(true);
  };

  const doCapture = async () => {
    setCapturing(true);
    await sleep(1400);
    setCapturing(false);
    setCaptureOpen(false);
    const conf = 0.85 + Math.random() * 0.14;
    setAttendance([
      ...attendance,
      {
        id: uid("at"),
        staffName: selectedStaff,
        department: staff.find((s) => s.name === selectedStaff)?.role ?? "—",
        inTime: nowTime(),
        faceConfidence: Number(conf.toFixed(2)),
        geofenceOk: true,
      },
    ]);
    toast.success(`Clock-in recorded — ${selectedStaff}`, {
      description: `Face match ${(conf * 100).toFixed(0)}% · geofence ✓ · hospital WiFi ✓`,
    });
  };

  const clockOut = (id: string) => {
    setAttendance(attendance.map((a) => (a.id === id ? { ...a, outTime: nowTime(), anomaly: undefined } : a)));
    toast.success("Clock-out recorded", { description: "Out-time anomaly cleared." });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* clock-in card */}
        <GlassCard>
          <SectionTitle title="Clock In / Out" subtitle="Face capture + geofence + WiFi attestation" />
          <select className="input-dark mb-3" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
            {staff.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-neon w-full" onClick={clockIn}>
            <LogIn size={15} /> Clock in with photo
          </button>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Badge tone="green"><MapPin size={10} /> Geofence: inside</Badge>
            <Badge tone="cyan"><Wifi size={10} /> ASTRA-STAFF-5G</Badge>
            <Badge tone="violet"><Camera size={10} /> Cam 02 · Kiosk</Badge>
          </div>
          <p className="text-[10px] text-slate-600 mt-3">
            Attestation requires all three: face match ≥ 0.75, geofence containment, and hospital WiFi SSID. Failures route to human review.
          </p>
        </GlassCard>

        {/* roster */}
        <GlassCard className="xl:col-span-2">
          <SectionTitle title="Today's Roster" subtitle={`${attendance.length} records · ${attendance.filter((a) => a.anomaly).length} anomalies`} />
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-800/95 backdrop-blur">
                <tr className="text-left text-slate-500 border-b border-white/10">
                  <th className="pb-2 pr-2 font-medium">Staff</th>
                  <th className="pb-2 pr-2 font-medium">Dept/Role</th>
                  <th className="pb-2 pr-2 font-medium">In</th>
                  <th className="pb-2 pr-2 font-medium">Out</th>
                  <th className="pb-2 pr-2 font-medium">Face</th>
                  <th className="pb-2 pr-2 font-medium">Geo</th>
                  <th className="pb-2 pr-2 font-medium">Flags</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {attendance.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="py-2.5 pr-2 text-white font-medium">{a.staffName}</td>
                    <td className="py-2.5 pr-2 text-slate-400">{a.department}</td>
                    <td className="py-2.5 pr-2 text-emerald-300 font-mono">{a.inTime ?? "—"}</td>
                    <td className="py-2.5 pr-2 font-mono text-slate-300">{a.outTime ?? <span className="text-amber-300">missing</span>}</td>
                    <td className="py-2.5 pr-2">
                      <span className={a.faceConfidence >= 0.75 ? "text-slate-300" : "text-red-300 font-semibold"}>
                        {(a.faceConfidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-2">{a.geofenceOk ? <span className="text-emerald-300">✓</span> : <span className="text-red-300">✗</span>}</td>
                    <td className="py-2.5 pr-2">
                      {a.anomaly ? <Badge tone="amber" className="!text-[9px]">human review</Badge> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5">
                      {!a.outTime && (
                        <button className="btn-ghost !p-1.5 !text-[10px]" onClick={() => clockOut(a.id)}>
                          <LogOut size={11} /> Out
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* anomaly explainer */}
      <GlassCard>
        <SectionTitle title="Anomaly Queue" subtitle="Flags that require human adjudication — nothing auto-approves" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {attendance.filter((a) => a.anomaly).map((a) => (
            <div key={a.id} className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-amber-300" />
                <span className="text-sm font-semibold text-white">{a.staffName}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{a.anomaly}</p>
              <div className="flex gap-2 mt-3">
                <button className="btn-ghost !text-[10px] !py-1" onClick={() => { setAttendance(attendance.map((x) => (x.id === a.id ? { ...x, anomaly: undefined } : x))); toast.success(`Approved — ${a.staffName}`); }}>
                  Approve
                </button>
                <button className="btn-ghost !text-[10px] !py-1 hover:!text-red-300" onClick={() => toast.info("Escalated to Attendance Auditor", { description: "Paperclip issue filed for follow-up." })}>
                  Escalate
                </button>
              </div>
            </div>
          ))}
          {attendance.filter((a) => a.anomaly).length === 0 && (
            <p className="text-xs text-slate-500 col-span-3">🎉 No open anomalies — all attestations clean.</p>
          )}
        </div>
      </GlassCard>

      {/* capture modal */}
      <Modal open={captureOpen} onClose={() => setCaptureOpen(false)} title="Face capture — kiosk cam 02">
        <div className="space-y-4">
          <div className="relative h-52 rounded-xl overflow-hidden border border-cyan-400/30 bg-gradient-to-br from-ink-700 via-ink-800 to-black flex items-center justify-center">
            {/* simulated viewfinder */}
            <div className="absolute inset-6 border-2 border-dashed border-cyan-400/40 rounded-full" />
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-3xl">
              {capturing ? "📸" : "🧑‍⚕️"}
            </div>
            {capturing && (
              <div className="absolute inset-0 bg-cyan-400/10 animate-pulse flex items-end justify-center pb-3">
                <span className="text-[10px] font-mono text-cyan-300">scanning biometric vectors…</span>
              </div>
            )}
            <span className="absolute top-2 left-2 text-[9px] font-mono text-slate-500">CAM 02 · LIVE (simulated)</span>
          </div>
          <button className="btn-neon w-full" disabled={capturing} onClick={() => void doCapture()}>
            {capturing ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Capturing…
              </>
            ) : (
              <>
                <Camera size={15} /> Capture & verify
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
